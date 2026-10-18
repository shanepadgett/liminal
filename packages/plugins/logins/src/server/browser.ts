/**
 * Signing in in the browser with PKCE: a local server the browser comes back to, the authorize page
 * opened in the browser, and an address the user pastes when the browser is on another machine.
 */

import { Crypto, type Data, Deferred, Effect, Exit, Option, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  type Authorized,
  type BrowserAuthorization,
  LoginFailed,
  LoginReturn,
} from "../contract.ts";

type LoginCallback = Data.TaggedEnum.Value<LoginReturn, "Callback">;

/** What the browser sent back: the code, or the error the provider gave. */
interface Reply {
  readonly code: string | undefined;
  readonly state: string | undefined;
  readonly error: string | undefined;
}

/** The flow steps a browser login shows and asks. */
export interface BrowserSteps {
  readonly openUrl: (url: string) => Effect.Effect<void>;
  readonly ask: (question: string) => Effect.Effect<string>;
  readonly tell: (text: string) => Effect.Effect<void>;
}

class PortTaken extends Schema.TaggedError<PortTaken, { readonly brand: unique symbol }>()(
  "PortTaken",
  { port: Schema.Int },
) {}

const randomBytes = 32;

const replyOf = (params: URLSearchParams): Reply => ({
  code: params.get("code") ?? undefined,
  state: params.get("state") ?? undefined,
  error: params.get("error_description") ?? params.get("error") ?? undefined,
});

const pastedReply = (address: string) =>
  replyOf(URL.parse(address.trim())?.searchParams ?? new URLSearchParams());

/** A pasted `code#state`, as Claude's code page shows it. */
const shownReply = (shown: string): Reply => {
  const [code, state] = shown.trim().split("#");

  return { code: code || undefined, state, error: undefined };
};

/** The verifier stays here; the challenge and state go to the authorize page. */
const makePkce = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const verifier = Base64Url.encode(yield* crypto.randomBytes(randomBytes));
  const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(verifier));
  const state = Base64Url.encode(yield* crypto.randomBytes(randomBytes));

  return { verifier, challenge: Base64Url.encode(digest), state };
});

/** Listens for the browser for the life of the scope; gives the port it bound. */
const listen = (callback: LoginCallback, reply: Deferred.Deferred<Reply>) =>
  Effect.acquireRelease(
    Effect.try({
      try: () =>
        Bun.serve({
          hostname: callback.host,
          port: callback.port,
          fetch: (request) => {
            const url = new URL(request.url);
            if (url.pathname !== callback.path) return new Response("Not found", { status: 404 });
            Deferred.doneUnsafe(reply, Exit.succeed(replyOf(url.searchParams)));

            return new Response("Liminal received the login. You can close this tab.");
          },
        }),
      catch: () => new PortTaken({ port: callback.port }),
    }),
    // Graceful, so the browser receives its page before the port closes.
    (server) => Effect.promise(() => server.stop()),
  ).pipe(Effect.map((server) => server.port ?? callback.port));

/** The browser's reply once it comes back; none when the port is taken, after saying so. */
const callbackReply = (steps: BrowserSteps, callback: LoginCallback) =>
  Effect.gen(function* () {
    const reply = yield* Deferred.make<Reply>();
    const port = yield* listen(callback, reply);

    return Option.some({ port, reply: Deferred.await(reply) });
  }).pipe(
    Effect.catchTag("PortTaken", (taken) =>
      steps
        .tell(
          `Port ${taken.port} is in use, so the browser cannot come back to Liminal. Paste the address it ends on instead.`,
        )
        .pipe(Effect.as(Option.none())),
    ),
  );

/** Opens `url` in the default browser; when that fails, the user opens the link shown. */
const openBrowser = (steps: BrowserSteps, url: string) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    const code = yield* spawner.exitCode(ChildProcess.make(opener, [url]));

    if (code !== 0) yield* steps.tell("Could not open the browser; open the link above.");
  }).pipe(
    Effect.catchTag("PlatformError", () =>
      steps.tell("Could not open the browser; open the link above."),
    ),
  );

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

/** The code, when the reply has one and belongs to this login. */
const codeOf = (method: string, reply: Reply, state: string) => {
  if (reply.error !== undefined)
    return Effect.fail(new LoginFailed({ method, message: `Sign-in failed: ${reply.error}` }));

  if (reply.state !== state)
    return Effect.fail(new LoginFailed({ method, message: "The reply belongs to another login" }));

  if (reply.code === undefined)
    return Effect.fail(new LoginFailed({ method, message: "The address holds no sign-in code" }));

  return Effect.succeed(reply.code);
};

/** Where the browser comes back to, and the reply once the user is done there. */
interface Return {
  readonly redirectUri: string;
  readonly reply: Effect.Effect<Reply>;
}

/**
 * The local server's reply, raced with a pasted address; only the pasted one when the port is
 * taken.
 */
const callbackReturn = Effect.fn("Logins.callbackReturn")(function* (
  steps: BrowserSteps,
  callback: LoginCallback,
) {
  const server = yield* callbackReply(steps, callback);
  const port = Option.match(server, { onNone: () => callback.port, onSome: (on) => on.port });

  const pasted = steps
    .ask("Or paste the address the browser ends on")
    .pipe(Effect.map(pastedReply));

  const reply = Option.match(server, {
    onNone: () => pasted,
    onSome: (on) => Effect.raceFirst(on.reply, pasted),
  });

  return { redirectUri: `http://${callback.host}:${port}${callback.path}`, reply } satisfies Return;
});

/** A page that shows `code#state` for the user to paste. */
const pageReturn = (steps: BrowserSteps, page: Data.TaggedEnum.Value<LoginReturn, "Page">) =>
  Effect.succeed<Return>({
    redirectUri: page.redirectUri,
    reply: steps.ask("Paste the code the page shows").pipe(Effect.map(shownReply)),
  });

/** Runs one browser sign-in for `method`; a callback port closes when it ends. */
export const authorizeInBrowser = (steps: BrowserSteps, method: string) =>
  Effect.fn("Logins.authorizeInBrowser")(
    function* (authorization: BrowserAuthorization) {
      const pkce = yield* makePkce;

      const returned = yield* LoginReturn.$match(authorization.returnTo, {
        Callback: (callback) => callbackReturn(steps, callback),
        Page: (page) => pageReturn(steps, page),
      });

      const url = authorizeAddress(authorization, pkce, returned.redirectUri);
      yield* steps.openUrl(url);
      yield* openBrowser(steps, url);

      const code = yield* codeOf(method, yield* returned.reply, pkce.state);

      return {
        code,
        verifier: pkce.verifier,
        redirectUri: returned.redirectUri,
        state: pkce.state,
      } satisfies Authorized;
    },
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(
        new LoginFailed({ method, message: `Sign-in could not start: ${error.message}` }),
      ),
    ),
    Effect.scoped,
  );
