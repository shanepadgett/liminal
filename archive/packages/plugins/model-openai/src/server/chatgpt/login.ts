/**
 * Sign in with ChatGPT: Liminal registers as its own app on the user's ChatGPT account on the first
 * login, checks each issued ID token, and revokes the login on sign-out.
 */

import { Crypto, Effect, Option, Predicate, Redacted } from "effect";
import { Base64Url } from "effect/encoding";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import {
  CredentialStore,
  type OAuth,
  oauthOf,
  requestTokens,
} from "@liminal/credential-store/contract";
import {
  type Authorized,
  LoginFailed,
  LoginFlow,
  LoginMethod,
  LoginReturn,
} from "@liminal/logins/contract";

import { chatgptLogin } from "../../contract.ts";
import { type ChatgptExtra, extraOf, issuer, resource, tokenRequest } from "./auth.ts";
import { makeHostId } from "./host-id.ts";
import { verifyIdToken } from "./id-token.ts";

/** The scope that lets requests spend the user's plan; a login can succeed without it. */
const planScope = "chatgpt.tokens.use.direct";

const scopes = `openid profile email offline_access resource.invoke ${planScope}`;

/** The client id a first login registers with; OpenAI then issues Liminal's own. */
const registrationClientId = "dynamic_agent_client";

const failed = (message: string) => new LoginFailed({ method: chatgptLogin, message });

/** What this login sent, which the reply and its ID token must match. */
interface Attempt {
  readonly client: HttpClient.HttpClient;
  readonly saved: Option.Option<ChatgptExtra>;
  readonly nonce: string;
}

/** The saved login, when one is saved. */
const savedLogin = (store: CredentialStore["Service"]) =>
  store.get(chatgptLogin).pipe(
    Effect.map((saved) =>
      Option.filter(saved, (credential): credential is OAuth =>
        Predicate.isTagged(credential, "OAuth"),
      ),
    ),
    Effect.mapError((error) => failed(`The ChatGPT login could not be read: ${error.message}`)),
  );

/**
 * A first login must come back with Liminal's new app id. A later login keeps its registration, so
 * a different id means the reply belongs to another registration.
 */
const issuedClientId = (saved: Option.Option<ChatgptExtra>, returned: Option.Option<string>) =>
  Option.match(saved, {
    onNone: () =>
      Effect.fromOption(returned).pipe(
        Effect.mapError(() => failed("Registering Liminal failed: OpenAI issued no app id")),
      ),
    onSome: (extra) =>
      Option.isSome(returned) && returned.value !== extra.clientId
        ? Effect.fail(failed("Registering Liminal failed: the reply names another app"))
        : Effect.succeed(extra.clientId),
  });

/** Exchanges the code, then accepts the tokens only with plan use allowed and a valid ID token. */
const exchange = Effect.fn("ChatgptLogin.exchange")(function* (
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

  const reply = yield* requestTokens(attempt.client, request).pipe(
    Effect.mapError((cause) => failed(`Sign in with ChatGPT failed: ${cause.message}`)),
  );

  if (!(reply.scope ?? "").split(" ").includes(planScope))
    return yield* failed(
      "The login did not allow Liminal to use your ChatGPT plan; sign in again and allow plan use",
    );

  if (reply.id_token === undefined) return yield* failed("OpenAI issued no ID token");
  yield* verifyIdToken(attempt.client, reply.id_token, clientId, attempt.nonce);

  return yield* oauthOf(reply, { clientId, idToken: reply.id_token });
});

/** The authorize parameters: a registration on the first login, the saved app after. */
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

/** Ends the login on OpenAI's side, so the refresh token stops working everywhere. */
const revoke = (client: HttpClient.HttpClient, store: CredentialStore["Service"]) =>
  Effect.gen(function* () {
    const saved = yield* savedLogin(store);
    if (Option.isNone(saved)) return;

    const extra = extraOf(saved.value);
    if (Option.isNone(extra)) return;

    const request = HttpClientRequest.post(`${issuer}/api/accounts/oauth/revoke`).pipe(
      HttpClientRequest.bodyUrlParams({
        token: Redacted.value(saved.value.refresh),
        token_type_hint: "refresh_token",
        client_id: extra.value.clientId,
      }),
    );

    yield* client.execute(request).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError((cause) =>
        failed(
          `OpenAI did not confirm the sign-out (${cause.message}). To end it on OpenAI's side, disconnect Liminal in ChatGPT settings at chatgpt.com/settings.`,
        ),
      ),
    );
  });

/** The Sign in with ChatGPT login method, over the services it is made with. */
export const makeChatgptMethod = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const store = yield* CredentialStore;
  const crypto = yield* Crypto.Crypto;
  const hostId = yield* makeHostId;

  const logIn = Effect.gen(function* () {
    const flow = yield* LoginFlow;
    const saved = Option.flatMap(yield* savedLogin(store), extraOf);
    const nonce = Base64Url.encode(yield* crypto.randomBytes(32));
    const attempt: Attempt = { client, saved, nonce };

    const authorized = yield* flow.authorizeInBrowser({
      authorizeUrl: `${issuer}/api/accounts/authorize`,
      params: paramsOf(attempt, yield* hostId.read),
      // OpenAI requires 127.0.0.1 in the redirect address, never localhost.
      returnTo: LoginReturn.Callback({ host: "127.0.0.1", port: 1455, path: "/auth/callback" }),
    });

    return yield* exchange(attempt, authorized);
  }).pipe(
    Effect.catchTag("PlatformError", (error) =>
      Effect.fail(failed(`Sign in with ChatGPT could not start: ${error.message}`)),
    ),
  );

  return LoginMethod.Flow({
    id: chatgptLogin,
    vendor: { id: "openai", name: "OpenAI" },
    title: "Sign in with ChatGPT",
    ways: [{ id: "browser", title: "Browser" }],
    logIn: () => logIn,
    logOut: Option.some(revoke(client, store)),
  });
});
