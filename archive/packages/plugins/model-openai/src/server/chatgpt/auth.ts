/**
 * Sign in with ChatGPT tokens: the token endpoint, what the credential keeps beside its tokens, and
 * the fresh access token each request is signed with.
 */

import { Duration, Effect, Option, Predicate, Redacted, Schema } from "effect";
import { type HttpClient, HttpClientRequest } from "effect/http";

import {
  type CredentialStore,
  type OAuth,
  oauthOf,
  requestTokens,
} from "@liminal/credential-store/contract";
import { ModelError } from "@liminal/sdk";

import { chatgptLogin } from "../../contract.ts";

export const issuer = "https://auth.openai.com";

/** The API the tokens are issued for. */
export const resource = "https://api.openai.com/v1";

/** Tokens are refreshed when they expire within this long. */
const refreshSkew = Duration.minutes(1);

/** What the credential keeps beside its tokens: Liminal's issued app id and the last ID token. */
export const ChatgptExtra = Schema.Struct({ clientId: Schema.String, idToken: Schema.String });

export type ChatgptExtra = typeof ChatgptExtra.Type;

/** The saved extra of `oauth`, when it holds one. */
export const extraOf = (oauth: OAuth) => Schema.decodeUnknownOption(ChatgptExtra)(oauth.extra);

/** A form request to the token endpoint for Liminal's app `clientId`. */
export const tokenRequest = (clientId: string, grant: Readonly<Record<string, string>>) =>
  HttpClientRequest.post(`${issuer}/api/accounts/oauth/token`).pipe(
    HttpClientRequest.bodyUrlParams({ ...grant, client_id: clientId, resource }),
  );

const authError = (message: string) => new ModelError({ reason: "auth", message });

/** Trades the refresh token for new tokens; the endpoint replaces the refresh token on every use. */
const refreshTokens = (client: HttpClient.HttpClient) => (stale: OAuth) =>
  Effect.gen(function* () {
    const extra = yield* Effect.fromOption(extraOf(stale)).pipe(
      Effect.mapError(() => authError("The ChatGPT login names no app; sign in with /connect")),
    );

    const request = tokenRequest(extra.clientId, {
      grant_type: "refresh_token",
      refresh_token: Redacted.value(stale.refresh),
    });

    const reply = yield* requestTokens(client, request).pipe(
      Effect.mapError((cause) => authError(`ChatGPT token refresh failed: ${cause.message}`)),
    );

    return yield* oauthOf(reply, stale.extra);
  });

/** The access token, refreshed first when it nears expiry. */
export const accessOf = (store: CredentialStore["Service"], client: HttpClient.HttpClient) =>
  store.fresh(chatgptLogin, refreshTokens(client), refreshSkew).pipe(
    Effect.map((tokens) => tokens.access),
    Effect.catchTag("CredentialError", (error) =>
      Effect.fail(authError(`No usable ChatGPT login: ${error.message}`)),
    ),
  );

/** Fails as `auth` while no ChatGPT login is saved, without refreshing or calling the API. */
export const checkLogin = (store: CredentialStore["Service"]) =>
  store.get(chatgptLogin).pipe(
    Effect.mapError((error) => authError(`ChatGPT login could not be read: ${error.message}`)),
    Effect.flatMap((saved) =>
      Option.isSome(saved) && Predicate.isTagged(saved.value, "OAuth")
        ? Effect.void
        : Effect.fail(authError("No ChatGPT login: sign in with /connect")),
    ),
  );
