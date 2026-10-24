/** The model call every turn and side call goes through, the providers it routes to, and the list. */
import { Effect, FileSystem, Layer, Path } from "effect";

import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";

import { makeCall } from "./call.ts";
import {
  ModelCall,
  ModelCatalog,
  type ModelProvider,
  ModelProviders,
  ModelRpc,
  Models,
} from "./contract.ts";
import { listModels, openLists } from "./list-cache.ts";
import { describe, listAll } from "./listing.ts";
import { make } from "./models.ts";
import { ModelSetting } from "./setting.ts";

const call = Layer.effect(
  ModelCall,
  Effect.gen(function* () {
    const settings = yield* Settings;
    yield* (yield* DeclaredSettings).add(ModelSetting);

    return yield* Pipeline.make(makeCall(yield* ModelProviders, settings, yield* ModelCatalog));
  }),
);

const models = Layer.effect(
  Models,
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const list = listModels(yield* openLists, providers, yield* ModelCatalog);

    return make(providers, yield* Settings, yield* ModelCall, list);
  }),
);

const rpc = ModelRpc.toLayer(
  Effect.gen(function* () {
    const known = yield* Models;
    const providers = yield* ModelProviders;
    const catalog = yield* ModelCatalog;

    return ModelRpc.of({
      "model/list": () => listAll(providers, known),
      "model/details": ({ model }) => describe(providers, catalog, model),
    });
  }),
);

export default definePlugin({
  name: "model",
  provides: [ModelProviders, ModelCall, Models],
  requires: [
    Settings,
    DeclaredSettings,
    ModelCatalog,
    Directories,
    FileSystem.FileSystem,
    Path.Path,
  ],
  layer: rpc.pipe(
    Layer.provideMerge(models),
    Layer.provideMerge(call),
    Layer.provideMerge(Layer.effect(ModelProviders, Registry.make<ModelProvider>())),
  ),
});
