/** The model call every turn and side call goes through, the providers it routes to, and roles. */
import { Effect, Layer } from "effect";

import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";

import { makeCall } from "./call.ts";
import { ModelCall, type ModelProvider, ModelProviders, Models } from "./contract.ts";
import { make } from "./models.ts";
import { ModelSetting } from "./setting.ts";

const call = Layer.effect(
  ModelCall,
  Effect.gen(function* () {
    const settings = yield* Settings;
    yield* (yield* DeclaredSettings).add(ModelSetting);

    return yield* Pipeline.make(makeCall(yield* ModelProviders, settings));
  }),
);

const models = Layer.effect(
  Models,
  Effect.gen(function* () {
    return make(yield* ModelProviders, yield* Settings, yield* ModelCall);
  }),
);

export default definePlugin({
  name: "model",
  provides: [ModelProviders, ModelCall, Models],
  requires: [Settings, DeclaredSettings],
  layer: models.pipe(
    Layer.provideMerge(call),
    Layer.provideMerge(Layer.effect(ModelProviders, Registry.make<ModelProvider>())),
  ),
});
