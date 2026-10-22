/** The Codex backend: requests signed as the Codex CLI signs them, and the plan's model list. */
import { Effect, Redacted, Schema } from "effect";
import { AiError } from "effect/ai";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import type { OAuth } from "@shanepadgett/liminal-accounts/contract";

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

const ModelList = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      display_name: Schema.optionalKey(Schema.String),
      /** `hide` marks models the Codex CLI keeps for its own use, such as reviews. */
      visibility: Schema.String,
    }),
  ),
});

const listFailed = (reason: AiError.AiErrorReason) =>
  AiError.make({ module: "Codex", method: "models", reason });

const unknown = (error: { readonly message: string }) =>
  listFailed(new AiError.UnknownError({ description: error.message }));

/** The models the plan offers, by slug and name; hidden ones are left out. */
export const planModels = Effect.fn("Codex.planModels")(function* (
  client: HttpClient.HttpClient,
  tokens: OAuth,
) {
  const request = HttpClientRequest.get(`${apiUrl}/models`, {
    urlParams: { client_version: clientVersion },
  }).pipe(signedAs(tokens));

  const response = yield* client.execute(request).pipe(Effect.mapError(unknown));

  if (response.status >= 400) {
    return yield* listFailed(
      AiError.reasonFromHttpStatus({
        status: response.status,
        description: yield* response.text.pipe(Effect.orElseSucceed(() => "")),
      }),
    );
  }

  const { models } = yield* HttpClientResponse.schemaBodyJson(ModelList)(response).pipe(
    Effect.mapError(unknown),
  );

  return models.flatMap((model) =>
    model.visibility === "list" ? [{ id: model.slug, name: model.display_name ?? model.slug }] : [],
  );
});
