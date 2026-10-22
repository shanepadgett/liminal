/** The Codex backend: requests signed as the Codex CLI signs them, and the plan's model list. */
import { Effect, Redacted } from "effect";
import { type HttpClient, HttpClientRequest } from "effect/http";

import type { OAuth } from "@shanepadgett/liminal-accounts/contract";

import { planModelInfo, planModels } from "../list.ts";

export const apiUrl = "https://chatgpt.com/backend-api/codex";

/** The backend hides models newer than the client version a request names. */
const clientVersion = "0.200.0";

/** Signs each request with the plan's token and account; the cache key keeps a session together. */
export const signedAs =
  (tokens: OAuth, cacheKey?: string) => (request: HttpClientRequest.HttpClientRequest) => {
    const signed = request.pipe(
      HttpClientRequest.bearerToken(Redacted.value(tokens.access)),
      HttpClientRequest.setHeaders({
        "chatgpt-account-id": tokens.extra["accountId"] ?? "",
        originator: "liminal",
      }),
    );

    return cacheKey === undefined
      ? signed
      : HttpClientRequest.setHeader(signed, "session-id", cacheKey);
  };

/** The models the plan offers through the Codex backend. */
export const codexModels = (client: HttpClient.HttpClient, tokens: OAuth) => {
  const request = HttpClientRequest.get(`${apiUrl}/models`, {
    urlParams: { client_version: clientVersion },
  }).pipe(signedAs(tokens));

  return Effect.map(planModels("Codex", client, request), (models) =>
    models.map((model) => planModelInfo("codex", model)),
  );
};
