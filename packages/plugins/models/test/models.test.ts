/** Listing and describing models from each kind of source, over a fake catalog. */

import { expect } from "bun:test";

import { Effect, Layer, Option, Predicate, Queue, Stream } from "effect";

import { ModelCatalog } from "@liminal/model-catalog/contract";
import { CatalogUnavailable, ModelError, type ModelInfo } from "@liminal/sdk";
import { effectTest, testPlugin } from "@liminal/sdk/testing";

import models from "../plugin.ts";
import {
  type ModelProvider,
  ModelProviders,
  Models,
  ModelSource,
  type PlanModel,
} from "../src/contract.ts";

const info = (id: string, contextWindow = 400_000): ModelInfo => ({
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
        ? Effect.succeed([info("gpt-a"), info("gpt-b"), info("gpt-c")])
        : Effect.fail(new CatalogUnavailable({ catalogId, message: "offline" })),
  }),
);

const testLayer = testPlugin(models, fakeCatalog);

const provider = (id: string, source: ModelSource): ModelProvider => ({
  id,
  name: id,
  source,
  stream: () => Stream.empty,
  nativeToolChanges: false,
});

const register = Effect.fn("register")(function* (...added: ReadonlyArray<ModelProvider>) {
  const providers = yield* ModelProviders;
  for (const one of added) yield* providers.register(one);
});

const ids = (listed: ReadonlyArray<ModelInfo>) => listed.map((model) => model.id);

effectTest(
  "a listed provider gives its list, a catalog provider the catalog's, and a plan the catalog's on it",
  Effect.gen(function* () {
    const plan = Effect.succeed([
      { id: "gpt-c", contextWindow: Option.some(272_000) },
      { id: "gpt-a", contextWindow: Option.none() },
      { id: "gpt-unknown", contextWindow: Option.none() },
    ]);

    yield* register(
      provider("fixed", ModelSource.Listed({ models: Effect.succeed([info("local")]) })),
      provider("api", ModelSource.Catalog({ catalogId: "openai" })),
      provider("plan", ModelSource.PlanCatalog({ catalogId: "openai", plan })),
    );

    const service = yield* Models;
    expect(ids(yield* service.listModels("fixed"))).toEqual(["local"]);
    expect(ids(yield* service.listModels("api"))).toEqual(["gpt-a", "gpt-b", "gpt-c"]);

    const onPlan = yield* service.listModels("plan");

    expect(onPlan.map((model) => [model.id, model.contextWindow])).toEqual([
      ["gpt-c", 272_000],
      ["gpt-a", 400_000],
    ]);
  }),
  testLayer,
);

effectTest(
  "describe finds one model without the plan, and fails for one not listed or an unavailable catalog",
  Effect.gen(function* () {
    yield* register(
      provider("plan", ModelSource.PlanCatalog({ catalogId: "openai", plan: Effect.die("read") })),
      provider("gone", ModelSource.Catalog({ catalogId: "elsewhere" })),
    );

    const service = yield* Models;
    expect((yield* service.describe({ provider: "plan", id: "gpt-b" })).name).toBe("GPT-B");

    const missing = yield* Effect.flip(service.describe({ provider: "plan", id: "gpt-z" }));
    expect(missing.message).toBe("plan lists no model gpt-z");

    const offline = yield* Effect.flip(service.listModels("gone"));
    expect(Predicate.isTagged(offline, "CatalogUnavailable")).toBe(true);
  }),
  testLayer,
);

/** A plan list naming one model. */
const only = (id: string) => [{ id, contextWindow: Option.none() }];

effectTest(
  "a plan list comes from the kept copy at once and is read again behind it; an auth failure forgets it",
  Effect.gen(function* () {
    const reads = yield* Queue.unbounded<Effect.Effect<ReadonlyArray<PlanModel>, ModelError>>();
    const plan = Effect.flatten(Queue.take(reads));
    yield* register(provider("plan", ModelSource.PlanCatalog({ catalogId: "openai", plan })));
    const service = yield* Models;
    const list = Effect.map(service.listModels("plan"), ids);

    yield* Queue.offer(reads, Effect.succeed(only("gpt-a")));
    expect(yield* list).toEqual(["gpt-a"]);

    // The plan is not read yet, so this list is the kept one; the read behind it waits.
    expect(yield* list).toEqual(["gpt-a"]);
    yield* Queue.offer(reads, Effect.succeed(only("gpt-b")));

    const latest = Effect.andThen(Effect.yieldNow, list).pipe(
      Effect.repeat({ until: (listed) => listed[0] === "gpt-b", times: 100 }),
    );

    expect(yield* latest).toEqual(["gpt-b"]);

    yield* Queue.offer(
      reads,
      Effect.fail(new ModelError({ reason: "auth", message: "signed out" })),
    );

    yield* Queue.offer(reads, Effect.succeed(only("gpt-c")));

    const refetched = Effect.andThen(Effect.yieldNow, list).pipe(
      Effect.repeat({ until: (listed) => listed[0] === "gpt-c", times: 100 }),
    );

    expect(yield* refetched).toEqual(["gpt-c"]);
  }),
  testLayer,
);
