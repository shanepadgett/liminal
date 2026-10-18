/** The models the ChatGPT plan offers, read from the Codex backend; the catalog supplies details. */

import { Effect, Option, Predicate, Schema } from "effect";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import type { PlanModel } from "@liminal/models/contract";
import { ModelError } from "@liminal/sdk";

import type { Signer } from "./auth.ts";

/** The backend hides models newer than the client version it is sent; recent versions see all. */
const clientVersion = "0.200.0";

const PlanModels = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      context_window: Schema.Int,
      /** `hide` marks models the Codex CLI keeps for its own use, such as reviews. */
      visibility: Schema.String,
    }),
  ),
});

/** The listed models with their context windows; hidden ones are left out. */
export const readPlan = (apiUrl: string, client: HttpClient.HttpClient, sign: Signer) =>
  Effect.gen(function* () {
    const signer = yield* sign();

    const request = HttpClientRequest.get(`${apiUrl}/models`, {
      urlParams: { client_version: clientVersion },
    });

    const { models } = yield* client.execute(signer(request)).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(PlanModels)),
      Effect.mapError((error) => {
        const status = Predicate.isTagged(error, "HttpClientError")
          ? error.response?.status
          : undefined;

        return new ModelError({
          reason: status === 401 || status === 403 ? "auth" : "provider",
          message: `Codex model list failed: ${error.message}`,
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
