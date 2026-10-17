/** Models' server: routes each call to its provider in the ModelProviders registry. */

import { Effect, Layer, Option, Stream } from "effect";

import { KeyedRegistry, ProviderNotFound } from "@liminal/sdk";

import { ModelProviders, Models } from "./contract.ts";

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

export const layer = Layer.effect(Models, make).pipe(
  Layer.provideMerge(KeyedRegistry.layer(ModelProviders, (provider) => provider.id)),
);
