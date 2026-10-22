/**
 * Signing in through the browser with PKCE: a local server the browser comes back to, raced with an
 * address the user pastes when the browser runs on another machine.
 */
import { Crypto, Deferred, Effect, Exit, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { type Authorized, type BrowserAuthorization, LoginFailed } from "./contract.ts";

/** What the browser sent back. */
interface Reply {
  readonly code: string | undefined;
  readonly state: string | undefined;
  readonly error: string | undefined;
}

/** The flow actions a browser sign-in uses. */
export interface BrowserSteps {
  readonly openUrl: (url: string) => Effect.Effect<void>;
  readonly ask: (question: string) => Effect.Effect<string>;
  readonly tell: (text: string) => Effect.Effect<void>;
}

class PortTaken extends Schema.TaggedError<PortTaken, { readonly brand: unique symbol }>()(
  "PortTaken",
  { port: Schema.Int },
) {}

const replyOf = (params: URLSearchParams): Reply => ({
  code: params.get("code") ?? undefined,
  state: params.get("state") ?? undefined,
  error: params.get("error_description") ?? params.get("error") ?? undefined,
});

/** A pasted address, or the `code#state` some providers show on a page. */
const pastedReply = (pasted: string): Reply => {
  const text = pasted.trim();
  const address = URL.parse(text);
  if (address !== null) return replyOf(address.searchParams);

  const [code, state] = text.split("#");

  return { code: code === "" ? undefined : code, state, error: undefined };
};

const randomText = Effect.map(
  Effect.flatMap(Crypto.Crypto, (crypto) => crypto.randomBytes(32)),
  Base64Url.encode,
);

/** The verifier stays here; the challenge and state go to the authorize page. */
const makePkce = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const verifier = yield* randomText;
  const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(verifier));

  return { verifier, challenge: Base64Url.encode(digest), state: yield* randomText };
});

/** Serves the callback path for the life of the scope, on the loopback address. */
const listen = (callback: BrowserAuthorization["callback"], reply: Deferred.Deferred<Reply>) =>
  Effect.acquireRelease(
    Effect.try({
      try: () =>
        Bun.serve({
          hostname: "127.0.0.1",
          port: callback.port,
          fetch: (request) => {
            const url = new URL(request.url);
            if (url.pathname !== callback.path) return new Response("Not found", { status: 404 });
            Deferred.doneUnsafe(reply, Exit.succeed(replyOf(url.searchParams)));

            return new Response("Liminal received the sign-in. You can close this tab.");
          },
        }),
      catch: () => new PortTaken({ port: callback.port }),
    }),
    // Graceful, so the browser gets its page before the port closes.
    (server) => Effect.promise(() => server.stop()),
  );

/** Opens `url`, then waits for the browser's reply, raced with a pasted address. */
const replyFrom = (steps: BrowserSteps, callback: BrowserAuthorization["callback"], url: string) =>
  Effect.gen(function* () {
    const pasted = Effect.map(
      steps.ask("Paste the address the browser ends on if it does not come back here"),
      pastedReply,
    );

    const reply = yield* Deferred.make<Reply>();

    const served = yield* listen(callback, reply).pipe(
      Effect.as(true),
      Effect.catchTag("PortTaken", () =>
        Effect.as(
          steps.tell(`Port ${callback.port} is in use, so the browser cannot come back here.`),
          false,
        ),
      ),
    );

    yield* steps.openUrl(url);

    return yield* served ? Effect.raceFirst(Deferred.await(reply), pasted) : pasted;
  });

const authorizeAddress = (
  authorization: BrowserAuthorization,
  pkce: { readonly challenge: string; readonly state: string },
  redirectUri: string,
) => {
  const url = new URL(authorization.authorizeUrl);

  const params = {
    ...authorization.params,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: pkce.state,
  };

  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  return url.toString();
};

/** The code, when the reply has one and belongs to this sign-in. */
const codeOf = (method: string, reply: Reply, state: string) => {
  const fail = (message: string) => Effect.fail(new LoginFailed({ method, message }));

  if (reply.error !== undefined) return fail(`Sign-in failed: ${reply.error}`);

  if (reply.state !== undefined && reply.state !== state)
    return fail("The reply is for another sign-in.");

  if (reply.code === undefined) return fail("The reply holds no sign-in code.");

  return Effect.succeed(reply.code);
};

/** Runs one browser sign-in for `method`; the local server closes when it ends. */
export const authorizeInBrowser = (steps: BrowserSteps, method: string) =>
  Effect.fn("Accounts.authorizeInBrowser")(
    function* (authorization: BrowserAuthorization) {
      const { callback } = authorization;
      const pkce = yield* makePkce;
      const redirectUri = `http://${callback.host}:${callback.port}${callback.path}`;
      const url = authorizeAddress(authorization, pkce, redirectUri);
      const code = yield* codeOf(method, yield* replyFrom(steps, callback, url), pkce.state);

      return { code, state: pkce.state, verifier: pkce.verifier, redirectUri } satisfies Authorized;
    },
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(
        new LoginFailed({ method, message: `Sign-in could not start: ${error.message}` }),
      ),
    ),
    Effect.scoped,
  );
