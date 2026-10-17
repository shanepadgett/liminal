/** The models the ChatGPT plan offers, read from the Codex backend. */

import { Effect, Predicate, Schema } from "effect";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import { ModelError, type ModelInfo, ThinkingLevel } from "@liminal/sdk";

import type { Signer } from "./auth.ts";

/** The backend hides models newer than the client version it is sent; recent versions see all. */
const clientVersion = "0.200.0";

/** The backend lists no output limit; this is the limit of its current models. */
const outputLimit = 128_000;

const PlanModels = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      display_name: Schema.String,
      context_window: Schema.Int,
      /** `hide` marks models the Codex CLI keeps for its own use, such as reviews. */
      visibility: Schema.String,
      input_modalities: Schema.Array(Schema.String),
      supported_reasoning_levels: Schema.Array(Schema.Struct({ effort: Schema.String })),
    }),
  ),
});

type PlanModel = (typeof PlanModels.Type)["models"][number];

const isLevel = Schema.is(ThinkingLevel);
const isInput = (input: string) => input === "text" || input === "image";

const modelInfo = (model: PlanModel): ModelInfo => ({
  id: model.slug,
  name: model.display_name,
  contextWindow: model.context_window,
  maxOutput: outputLimit,
  thinking: model.supported_reasoning_levels.map(({ effort }) => effort).filter(isLevel),
  input: model.input_modalities.filter(isInput),
});

/** The listed models; hidden ones are left out. */
export const listModels = (apiUrl: string, client: HttpClient.HttpClient, sign: Signer) =>
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

    return models.flatMap((model) => (model.visibility === "list" ? [modelInfo(model)] : []));
  });
