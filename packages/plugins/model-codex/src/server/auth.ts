/** Signing Codex requests with the ChatGPT login, refreshing its tokens when they near expiry. */

import { Clock, Duration, Effect, Option, Predicate, Redacted, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { type CredentialStore, OAuth } from "@liminal/credential-store/contract";
import { ModelError } from "@liminal/sdk";

import { codexLogin } from "../contract.ts";

/** The OAuth client of the Codex CLI, which the ChatGPT login is issued to. */
export const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const tokenUrl = "https://auth.openai.com/oauth/token";

/** Tokens are refreshed when they expire within this long. */
const refreshSkew = Duration.minutes(1);

const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Finite,
});

const Claims = Schema.fromJsonString(
  Schema.Struct({
    "https://api.openai.com/auth": Schema.Struct({ chatgpt_account_id: Schema.String }),
  }),
);

const authError = (message: string) => new ModelError({ reason: "auth", message });

/** Posts `params` to the token endpoint and gives the tokens it issued as a saved credential. */
export const requestTokens = Effect.fn("Codex.requestTokens")(function* (
  client: HttpClient.HttpClient,
  params: Readonly<Record<string, string>>,
  extra: OAuth["extra"],
) {
  const request = HttpClientRequest.post(tokenUrl).pipe(
    HttpClientRequest.bodyUrlParams({ ...params, client_id: clientId }),
  );

  const tokens = yield* client
    .execute(request)
    .pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(TokenResponse)),
    );

  const now = yield* Clock.currentTimeMillis;

  return OAuth.make({
    access: Redacted.make(tokens.access_token),
    refresh: Redacted.make(tokens.refresh_token),
    expiresAt: now + Math.round(tokens.expires_in * 1000),
    extra,
  });
});

/** Trades the refresh token for new tokens; the endpoint replaces the refresh token on every use. */
const refreshTokens = (client: HttpClient.HttpClient) => (stale: OAuth) =>
  requestTokens(
    client,
    { grant_type: "refresh_token", refresh_token: Redacted.value(stale.refresh) },
    stale.extra,
  ).pipe(Effect.mapError((cause) => authError(`Codex token refresh failed: ${cause.message}`)));

/** The ChatGPT account id the access token's claims name. */
export const accountId = (access: string) => {
  const payload = access.split(".")[1] ?? "";
  const json = Base64Url.decodeString(payload);
  if (Result.isFailure(json)) return Effect.fail(authError("Codex access token is not a JWT"));

  return Schema.decodeEffect(Claims)(json.success).pipe(
    Effect.map((claims) => claims["https://api.openai.com/auth"].chatgpt_account_id),
    Effect.mapError(() => authError("Codex access token names no ChatGPT account")),
  );
};

/** A request signer for one call; `session` groups the calls of one conversation. */
export type Signer = (
  session?: string,
) => Effect.Effect<
  (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest,
  ModelError
>;

/** Fails as `auth` while no Codex login is saved, without refreshing or calling the backend. */
export const checkLogin = (store: CredentialStore["Service"]) =>
  store.get(codexLogin).pipe(
    Effect.mapError((error) => authError(`Codex login could not be read: ${error.message}`)),
    Effect.flatMap((saved) =>
      Option.isSome(saved) && Predicate.isTagged(saved.value, "OAuth")
        ? Effect.void
        : Effect.fail(authError("No Codex login: sign in with /connect")),
    ),
  );

export const makeSigner =
  (store: CredentialStore["Service"], client: HttpClient.HttpClient): Signer =>
  (session) =>
    Effect.gen(function* () {
      const tokens = yield* store
        .fresh(codexLogin, refreshTokens(client), refreshSkew)
        .pipe(
          Effect.catchTag("CredentialError", (error) =>
            Effect.fail(authError(`No usable Codex login: ${error.message}`)),
          ),
        );

      const access = Redacted.value(tokens.access);
      const account = yield* accountId(access);

      return (request: HttpClientRequest.HttpClientRequest) => {
        const signed = request.pipe(
          HttpClientRequest.bearerToken(access),
          HttpClientRequest.setHeaders({ "chatgpt-account-id": account, originator: "liminal" }),
        );

        return session === undefined
          ? signed
          : HttpClientRequest.setHeader(signed, "session-id", session);
      };
    });
