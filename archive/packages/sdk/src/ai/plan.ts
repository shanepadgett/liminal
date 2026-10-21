/**
 * The models a ChatGPT plan offers. The Codex backend and the public API answer a plan token with
 * the same list; the catalog supplies each model's details.
 */

import { Effect, Option, Predicate, Schema } from "effect";
import { type HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/http";

import { ModelError, type PlanModel } from "../core/index.ts";

const PlanList = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      context_window: Schema.Int,
      /** `hide` marks models the Codex CLI keeps for its own use, such as reviews. */
      visibility: Schema.String,
    }),
  ),
});

/** Signs one request with the account's current token. */
export type RequestSigner = Effect.Effect<
  (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest,
  ModelError
>;

/**
 * Sends `request`, signed by `sign`, and gives the listed models with their context windows; hidden
 * ones are left out. `name` names the provider in errors.
 */
export const planModels = Effect.fn("planModels")(function* (
  name: string,
  request: HttpClientRequest.HttpClientRequest,
  client: HttpClient.HttpClient,
  sign: RequestSigner,
) {
  const signer = yield* sign;

  const { models } = yield* client.execute(signer(request)).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(PlanList)),
    Effect.mapError((error) => {
      const status = Predicate.isTagged(error, "HttpClientError")
        ? error.response?.status
        : undefined;

      return new ModelError({
        reason: status === 401 || status === 403 ? "auth" : "provider",
        message: `${name} model list failed: ${error.message}`,
        status,
      });
    }),
  );

  return models.flatMap((model): ReadonlyArray<PlanModel> =>
    model.visibility === "list"
      ? [{ id: model.slug, contextWindow: Option.some(model.context_window) }]
      : [],
  );
});
