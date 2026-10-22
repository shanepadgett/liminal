/** The ChatGPT plan's OAuth tokens, issued to the Codex CLI's client, and the account they name. */
import { Effect, Redacted, Result, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { type HttpClient, HttpClientRequest } from "effect/http";

import {
  type OAuth,
  type TokenReply,
  requestTokens,
  TokensRefused,
} from "@shanepadgett/liminal-accounts/contract";

/** The OAuth client of the Codex CLI, which ChatGPT plan logins are issued to. */
export const clientId = "app_EMoamEEZ73f0CkXaXp7hrann";
export const issuer = "https://auth.openai.com";

const Claims = Schema.fromJsonString(
  Schema.Struct({
    "https://api.openai.com/auth": Schema.Struct({ chatgpt_account_id: Schema.String }),
  }),
);

/** The ChatGPT account id in the access token's claims, kept in the credential's `extra`. */
const accountOf = Effect.fn("Codex.accountOf")(function* (reply: TokenReply) {
  const json = Base64Url.decodeString(reply.access_token.split(".")[1] ?? "");

  if (Result.isFailure(json)) {
    return yield* new TokensRefused({ message: "The access token is not a JWT." });
  }

  const claims = yield* Schema.decodeEffect(Claims)(json.success).pipe(
    Effect.mapError(() => new TokensRefused({ message: "The token names no ChatGPT account." })),
  );

  return { accountId: claims["https://api.openai.com/auth"].chatgpt_account_id };
});

/** Posts `fields` to the token endpoint and gives the tokens it issued. */
export const tokensFor = (
  client: HttpClient.HttpClient,
  fields: Readonly<Record<string, string>>,
) =>
  requestTokens(
    client,
    HttpClientRequest.post(`${issuer}/oauth/token`).pipe(
      HttpClientRequest.bodyUrlParams({ ...fields, client_id: clientId }),
    ),
    accountOf,
  );

/** Trades the refresh token for new tokens; the endpoint replaces the refresh token each time. */
export const refreshTokens = (client: HttpClient.HttpClient) => (stale: OAuth) =>
  tokensFor(client, { grant_type: "refresh_token", refresh_token: Redacted.value(stale.refresh) });
