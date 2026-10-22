/**
 * Sign in with ChatGPT tokens: the token endpoint, what the credential keeps beside its tokens, and
 * the refresh.
 */
import { Effect, Option, Redacted, Schema } from "effect";
import { type HttpClient, HttpClientRequest } from "effect/http";

import { type OAuth, requestTokens, TokensRefused } from "@shanepadgett/liminal-accounts/contract";

export const issuer = "https://auth.openai.com";

/** The API the tokens are issued for, which `chatgpt` calls. */
export const resource = "https://api.openai.com/v1";

/** What the credential keeps beside its tokens: Liminal's issued client id and the last ID token. */
const ChatgptExtra = Schema.Struct({ clientId: Schema.String, idToken: Schema.String });

export type ChatgptExtra = typeof ChatgptExtra.Type;

/** The saved extra of `oauth`, when it holds one. */
export const extraOf = (oauth: OAuth) => Schema.decodeUnknownOption(ChatgptExtra)(oauth.extra);

/** A form request to the token endpoint for the client `clientId`. */
export const tokenRequest = (clientId: string, grant: Readonly<Record<string, string>>) =>
  HttpClientRequest.post(`${issuer}/api/accounts/oauth/token`).pipe(
    HttpClientRequest.bodyUrlParams({ ...grant, client_id: clientId, resource }),
  );

/** Trades the refresh token for new tokens; the endpoint replaces the refresh token on every use. */
export const refreshTokens = (client: HttpClient.HttpClient) => (stale: OAuth) =>
  Effect.gen(function* () {
    const extra = extraOf(stale);

    if (Option.isNone(extra)) {
      return yield* new TokensRefused({ message: "The saved login names no client." });
    }

    const request = tokenRequest(extra.value.clientId, {
      grant_type: "refresh_token",
      refresh_token: Redacted.value(stale.refresh),
    });

    return yield* requestTokens(client, request, () => Effect.succeed(stale.extra));
  });
