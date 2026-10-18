/** A fake catalog and provider helpers for the models tests. */

import { Effect, Layer, Option, Stream } from "effect";

import { ModelCatalog } from "@liminal/model-catalog/contract";
import { CatalogUnavailable, type ModelInfo, ThinkingOff } from "@liminal/sdk";
import { testPlugin } from "@liminal/sdk/testing";

import models from "../plugin.ts";
import { type ModelProvider, ModelProviders, type ModelSource } from "../src/contract.ts";

export const info = (id: string, contextWindow = 400_000): ModelInfo => ({
  id,
  name: id.toUpperCase(),
  contextWindow,
  maxOutput: 128_000,
  thinking: [],
  input: ["text"],
});

/** Catalog id `openai` lists three models; any other id is unavailable. */
const fakeCatalog = Layer.succeed(
  ModelCatalog,
  ModelCatalog.of({
    models: (catalogId) =>
      catalogId === "openai"
        ? Effect.succeed(
            ["gpt-a", "gpt-b", "gpt-c"].map((id) => ({ info: info(id), package: Option.none() })),
          )
        : Effect.fail(new CatalogUnavailable({ catalogId, message: "offline" })),
  }),
);

export const testLayer = testPlugin(models, fakeCatalog);

/** A provider with nothing to stream unless `stream` is given; its cheap model is `small`. */
export const provider = (
  id: string,
  source: ModelSource,
  stream: ModelProvider["stream"] = () => Stream.empty,
): ModelProvider => ({
  id,
  name: id,
  source,
  stream,
  nativeToolChanges: false,
  cheap: { id: "small", thinking: ThinkingOff.make({}) },
});

export const register = Effect.fn("register")(function* (...added: ReadonlyArray<ModelProvider>) {
  const providers = yield* ModelProviders;
  for (const one of added) yield* providers.register(one);
});
