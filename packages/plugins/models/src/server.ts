/** Models' server: routes each call to its provider in the ModelProviders registry. */

import { Effect, Layer, Option, Stream } from "effect";

import { KeyedRegistry, ProviderNotFound } from "@liminal/sdk";

import { ModelProviders, Models, ModelsRpcs } from "./contract.ts";

const make = Effect.gen(function* () {
  const providers = yield* ModelProviders;

  const provider = Effect.fn("Models.provider")(function* (id: string) {
    const found = yield* providers.get(id);
    if (Option.isNone(found)) return yield* new ProviderNotFound({ provider: id });

    return found.value;
  });

  return Models.of({
    stream: (request) =>
      Stream.unwrap(Effect.map(provider(request.model.provider), (found) => found.stream(request))),
    listProviders: Effect.map(providers.list, (all) => all.map(({ id, name }) => ({ id, name }))),
    listModels: (id) => Effect.flatMap(provider(id), (found) => found.models),
  });
});

const rpcs = ModelsRpcs.toLayer(
  Effect.gen(function* () {
    const models = yield* Models;

    return ModelsRpcs.of({
      "models/providers": () => models.listProviders,
      "models/list": ({ provider }) => models.listModels(provider),
    });
  }),
);

export const layer = rpcs.pipe(
  Layer.provideMerge(Layer.effect(Models, make)),
  Layer.provideMerge(KeyedRegistry.layer(ModelProviders, (provider) => provider.id)),
);
