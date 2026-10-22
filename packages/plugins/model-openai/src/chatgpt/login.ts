/**
 * Sign in with ChatGPT: Liminal registers as its own client on the user's ChatGPT account on the
 * first login, and checks each issued ID token against OpenAI's published keys.
 */
import { type Crypto, Effect, Option, type PlatformError, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { type HttpClient, HttpClientRequest } from "effect/http";
import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  type Authorized,
  Credentials,
  LoginFailed,
  LoginFlow,
  type LoginMethod,
  OAuth,
  requestTokens,
  type TokenReply,
} from "@shanepadgett/liminal-accounts/contract";

import { revokeFields, revoking } from "../revoke.ts";
import { type ChatgptExtra, extraOf, issuer, resource, tokenRequest } from "./auth.ts";

const methodId = "chatgpt/sign-in";

/** The scope that lets requests spend the user's plan; a login can succeed without it. */
const planScope = "chatgpt.tokens.use.direct";

const scopes = `openid profile email offline_access resource.invoke ${planScope}`;

/** The client id a first login registers with; OpenAI then issues Liminal's own. */
const registrationClientId = "dynamic_agent_client";

/** OpenAI's signing keys, fetched on first use and kept. */
const signingKeys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

const failed = (message: string) => new LoginFailed({ method: methodId, message });

/** What this login sent, which the reply and its ID token must match. */
interface Attempt {
  readonly client: HttpClient.HttpClient;
  readonly saved: Option.Option<ChatgptExtra>;
  readonly nonce: string;
}

/** Checks the ID token's signature, issuer, audience, expiry, subject and nonce. */
const verifyIdToken = (token: string, clientId: string, nonce: string) =>
  Effect.tryPromise({
    try: () =>
      jwtVerify(token, signingKeys, {
        issuer,
        audience: clientId,
        algorithms: ["RS256"],
        requiredClaims: ["exp", "nonce", "sub"],
      }),
    catch: (cause) =>
      failed(
        `OpenAI issued an invalid ID token: ${cause instanceof Error ? cause.message : "unknown error"}.`,
      ),
  }).pipe(
    Effect.flatMap(({ payload }) =>
      payload["nonce"] === nonce
        ? Effect.void
        : Effect.fail(failed("The ID token belongs to another sign-in.")),
    ),
  );

/**
 * A first login must come back with Liminal's new client id. A later login keeps its registration,
 * so a different id means the reply belongs to another registration.
 */
const issuedClientId = (saved: Option.Option<ChatgptExtra>, returned: string | undefined) => {
  if (Option.isSome(saved)) {
    return returned === undefined || returned === saved.value.clientId
      ? Effect.succeed(saved.value.clientId)
      : Effect.fail(failed("Registering Liminal failed: the reply names another client."));
  }

  return returned === undefined
    ? Effect.fail(failed("Registering Liminal failed: OpenAI issued no client id."))
    : Effect.succeed(returned);
};

/** Accepts the tokens only with plan use allowed and a valid ID token, which the extra keeps. */
const checkReply = Effect.fn("Chatgpt.checkReply")(function* (
  reply: TokenReply,
  clientId: string,
  nonce: string,
) {
  if (!(reply.scope ?? "").split(" ").includes(planScope)) {
    return yield* failed(
      "The login did not allow Liminal to use your ChatGPT plan. Sign in again and allow it.",
    );
  }

  if (reply.id_token === undefined) return yield* failed("OpenAI issued no ID token.");
  yield* verifyIdToken(reply.id_token, clientId, nonce);

  return { clientId, idToken: reply.id_token } satisfies ChatgptExtra;
});

/** Exchanges the code for tokens and checks them. */
const exchange = Effect.fn("Chatgpt.exchange")(function* (
  attempt: Attempt,
  authorized: Authorized,
) {
  const clientId = yield* issuedClientId(attempt.saved, authorized.clientId);

  const request = tokenRequest(clientId, {
    grant_type: "authorization_code",
    code: authorized.code,
    code_verifier: authorized.verifier,
    redirect_uri: authorized.redirectUri,
  });

  return yield* requestTokens(attempt.client, request, (reply) =>
    checkReply(reply, clientId, attempt.nonce),
  ).pipe(
    Effect.catchTag("TokensRefused", (error) =>
      Effect.fail(failed(`Sign in with ChatGPT failed: ${error.message}`)),
    ),
  );
});

/** The authorize parameters: a registration on the first login, the saved client after. */
const paramsOf = (attempt: Attempt, hostId: string) => ({
  ...Option.match(attempt.saved, {
    onNone: () => ({ client_id: registrationClientId, agent_name_hint: "Liminal" }),
    onSome: (extra) => ({ client_id: extra.clientId, id_token_hint: extra.idToken }),
  }),
  ext_agent_host_id: hostId,
  scope: scopes,
  resource,
  nonce: attempt.nonce,
});

/** The saved login's client and ID token, when one is saved. */
const savedExtra = (credentials: Credentials["Service"]) =>
  credentials.get("chatgpt").pipe(
    Effect.map((saved) => Option.flatMap(Option.filter(saved, Schema.is(OAuth)), extraOf)),
    Effect.mapError((error) => failed(`The ChatGPT login could not be read: ${error.message}`)),
  );

/** A revoke for the refresh token, sent as the client the login registered. */
const revokeRequest = (tokens: OAuth) =>
  Option.map(extraOf(tokens), ({ clientId }) =>
    HttpClientRequest.post(`${issuer}/api/accounts/oauth/revoke`).pipe(
      HttpClientRequest.bodyUrlParams(revokeFields(tokens, clientId)),
    ),
  );

/** What the login is made with; `hostId` reads this machine's host id. */
interface LoginServices {
  readonly client: HttpClient.HttpClient;
  readonly credentials: Credentials["Service"];
  readonly crypto: Crypto.Crypto;
  readonly hostId: Effect.Effect<string, PlatformError.PlatformError>;
}

/** Sign in with ChatGPT, through the browser only, saved under `chatgpt`. */
export const chatgptLogin = (services: LoginServices): LoginMethod => {
  const run = Effect.gen(function* () {
    const saved = yield* savedExtra(services.credentials);
    const nonce = Base64Url.encode(yield* services.crypto.randomBytes(32));
    const attempt: Attempt = { client: services.client, saved, nonce };

    const authorized = yield* (yield* LoginFlow).authorizeInBrowser({
      authorizeUrl: `${issuer}/api/accounts/authorize`,
      params: paramsOf(attempt, yield* services.hostId),
      // OpenAI takes only 127.0.0.1 in the redirect address, never localhost.
      callback: { host: "127.0.0.1", port: 1455, path: "/auth/callback" },
    });

    return yield* exchange(attempt, authorized);
  }).pipe(
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(failed(`Sign in with ChatGPT could not start: ${error.message}`)),
    ),
  );

  return {
    id: methodId,
    provider: "chatgpt",
    vendor: "OpenAI",
    title: "Sign in with ChatGPT",
    ways: [{ id: "browser", title: "In the browser", run }],
    logOut: revoking("chatgpt", services.client, revokeRequest),
  };
};
