/** Anthropic's Claude models, signed with the key in `ANTHROPIC_API_KEY`. */
import { Config, Effect, Layer, Option } from "effect";
import { AiError } from "effect/ai";
import { HttpClient } from "effect/http";

import { definePlugin } from "@shanepadgett/liminal-core";
import { ModelCatalog } from "@shanepadgett/liminal-model-catalog/contract";
import { messagesModel, messagesModels } from "@shanepadgett/liminal-model-wire/messages";
import { type ModelDetails, ModelProviders } from "@shanepadgett/liminal-model/contract";

const keyVariable = "ANTHROPIC_API_KEY";

/** The key, read on each call so a missing one fails the call, not the composition. */
const options = Effect.gen(function* () {
  const key = yield* Config.option(Config.Redacted(keyVariable)).pipe(Effect.orDie);

  if (Option.isSome(key)) return { apiKey: key.value };

  return yield* AiError.make({
    module: "Anthropic",
    method: "sign",
    reason: new AiError.AuthenticationError({
      kind: "MissingKey",
      description: `Set ${keyVariable}.`,
    }),
  });
});

const register = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const catalog = yield* ModelCatalog;

  /** Details by model id; without the catalog, models go without them and calls still run. */
  const details = catalog.models("anthropic").pipe(
    Effect.map((models) => new Map(models.map((model) => [model.id, model.details]))),
    Effect.catchTag("CatalogUnavailable", (error) =>
      Effect.as(Effect.logWarning(error.message), new Map<string, ModelDetails>()),
    ),
  );

  const models = Effect.gen(function* () {
    const listed = yield* withHttp(Effect.flatMap(options, messagesModels));
    const known = yield* details;

    return listed.map(({ id, name }) => ({ id: `anthropic/${id}`, name, details: known.get(id) }));
  });

  const languageModel = Effect.fn("Anthropic.languageModel")(function* (
    model: string,
    thinking: string | undefined,
  ) {
    const outputLimit = (yield* details).get(model)?.outputLimit;

    return yield* withHttp(messagesModel(yield* options, model, { thinking, outputLimit }));
  });

  yield* (yield* ModelProviders).add({
    id: "anthropic",
    name: "Anthropic",
    defaults: {
      main: { model: "anthropic/claude-opus-5-5" },
      small: { model: "anthropic/claude-haiku-5-5" },
    },
    models,
    languageModel,
  });
});

export default definePlugin({
  name: "model-anthropic",
  provides: [],
  requires: [ModelProviders, ModelCatalog, HttpClient.HttpClient],
  layer: Layer.effectDiscard(register),
});
