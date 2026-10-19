/**
 * Models' server: routes each call to its provider in the ModelProviders registry; plan lists come
 * from the kept copy and are read again behind it.
 */

import { Effect, Layer, Option, Stream } from "effect";

import { ModelCatalog } from "@liminal/model-catalog/contract";
import {
  KeyedRegistry,
  ModelError,
  type ModelInfo,
  type ModelRef,
  type PlanModel,
  ProviderNotFound,
} from "@liminal/sdk";

import { ModelSource, ModelProviders, Models, ModelsRpcs, ModelTask } from "./contract.ts";
import { makePlans } from "./server/plans.ts";
import { make as makeTask } from "./server/task.ts";

/** The catalog's models the plan offers, in the plan's order, each with the plan's context window. */
const onPlan = (catalog: ReadonlyArray<ModelInfo>, plan: ReadonlyArray<PlanModel>) =>
  plan.flatMap((offered) => {
    const info = catalog.find((model) => model.id === offered.id);
    if (info === undefined) return [];

    return [
      { ...info, contextWindow: Option.getOrElse(offered.contextWindow, () => info.contextWindow) },
    ];
  });

const make = Effect.gen(function* () {
  const providers = yield* ModelProviders;
  const catalog = yield* ModelCatalog;
  const plans = yield* makePlans;

  const provider = Effect.fn("Models.provider")(function* (id: string) {
    const found = yield* providers.get(id);
    if (Option.isNone(found)) return yield* new ProviderNotFound({ provider: id });

    return found.value;
  });

  /** The catalog's models under `catalogId`, without their packages. */
  const catalogInfos = (catalogId: string) =>
    Effect.map(catalog.models(catalogId), (models) => models.map((model) => model.info));

  const listed = (source: ModelSource) =>
    ModelSource.$is("Listed")(source) ? source.models : catalogInfos(source.catalogId);

  const listModels = Effect.fn("Models.listModels")(function* (id: string) {
    const { source, checkLogin } = yield* provider(id);
    if (checkLogin !== undefined) yield* checkLogin;
    if (!ModelSource.$is("PlanCatalog")(source)) return yield* listed(source);

    const [models, plan] = yield* Effect.all(
      [catalogInfos(source.catalogId), plans.planOf(id, source.plan)],
      { concurrency: 2 },
    );

    return onPlan(models, plan);
  });

  const describe = Effect.fn("Models.describe")(function* (model: ModelRef) {
    const models = yield* listed((yield* provider(model.provider)).source);
    const found = models.find((info) => info.id === model.id);

    if (found !== undefined) return found;

    return yield* new ModelError({
      reason: "invalid-request",
      message: `${model.provider} lists no model ${model.id}`,
    });
  });

  return Models.of({
    stream: (request) =>
      Stream.unwrap(Effect.map(provider(request.model.provider), (found) => found.stream(request))),
    listProviders: Effect.map(providers.list, (all) => all.map(({ id, name }) => ({ id, name }))),
    listModels,
    describe,
    cheap: (id) =>
      Effect.map(provider(id), ({ cheap }) => ({
        model: { provider: id, id: cheap.id },
        thinking: cheap.thinking,
      })),
    cacheLifetime: (id) => Effect.map(provider(id), ({ cacheLifetime }) => cacheLifetime),
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

export const layer = Layer.mergeAll(
  rpcs,
  Layer.effect(ModelTask, Effect.map(Models, makeTask)),
).pipe(
  Layer.provideMerge(Layer.effect(Models, make)),
  Layer.provideMerge(KeyedRegistry.layer(ModelProviders, (provider) => provider.id)),
);
