/** The catalog over a fake models.dev: fetching, mapping entries, the cache file and its refresh. */

import { expect } from "bun:test";
import { join } from "node:path";

import {
  Context,
  Duration,
  Option,
  Effect,
  FileSystem,
  Layer,
  Path,
  Predicate,
  Queue,
  Schema,
} from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";

import { Directories, ThinkingBudget, ThinkingEffort, ThinkingOff, ThinkingOn } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { ModelCatalog } from "../src/contract.ts";
import { catalogLayer } from "../src/server.ts";
import { CatalogCache } from "../src/server/cache.ts";

const savedCache = (fs: FileSystem.FileSystem) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const text = yield* fs.readFileString(path.join((yield* Directories).data, "catalog.json"));

    return yield* Schema.decodeEffect(Schema.fromJsonString(CatalogCache))(text);
  });

const fixture = join(import.meta.dir, "fixtures", "models-dev.json");

/** Models.dev answering with the fixture, or with `status` alone; each request goes on `requests`. */
const fakeModelsDev = (requests: Queue.Queue<string>, status = 200) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.gen(function* () {
        yield* Queue.offer(requests, request.url);
        const body = status === 200 ? yield* Effect.promise(() => Bun.file(fixture).text()) : "";

        return HttpClientResponse.fromWeb(request, new Response(body, { status }));
      }),
    ),
  );

/** A started catalog over the fake, and the queue of requests it made. */
const startCatalog = (status = 200) =>
  Effect.gen(function* () {
    const requests = yield* Queue.unbounded<string>();

    const built = yield* Layer.build(
      catalogLayer.pipe(Layer.provide(fakeModelsDev(requests, status))),
    );

    return { catalog: Context.get(built, ModelCatalog), requests };
  });

/** A catalog whose HTTP requests never finish, to expose reads that wait on the network. */
const startBlockedCatalog = Effect.gen(function* () {
  const requests = yield* Queue.unbounded<string>();

  const http = HttpClient.make((request) =>
    Effect.andThen(Queue.offer(requests, request.url), Effect.never),
  );

  const built = yield* Layer.build(
    catalogLayer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http))),
  );

  return { catalog: Context.get(built, ModelCatalog), requests };
});

/** The catalog's models under `catalogId`, without their packages. */
const infosOf = (catalog: ModelCatalog["Service"], catalogId: string) =>
  Effect.map(catalog.models(catalogId), (models) => models.map((model) => model.info));

effectTest(
  "a catalog id is fetched once, mapped, and saved alone",
  Effect.gen(function* () {
    const { catalog, requests } = yield* startCatalog();
    const models = yield* infosOf(catalog, "openai");
    yield* catalog.models("openai");

    expect(yield* Queue.size(requests)).toBe(1);
    expect(models.map((model) => model.id)).toEqual(["gpt-5.2", "gpt-4o"]);

    const [reasoning, plain] = models;

    expect(reasoning?.thinking.map((option) => option.id)).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);

    expect(reasoning?.thinking[0]?.value).toEqual(ThinkingEffort.make({ effort: "none" }));
    expect(reasoning?.defaultThinking).toBe("medium");
    expect(reasoning?.price).toEqual({ input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 });
    expect(plain?.thinking).toEqual([]);
    expect(plain?.input).toEqual(["text", "image"]);

    const saved = yield* savedCache(yield* FileSystem.FileSystem);
    expect(Object.keys(saved.providers)).toEqual(["openai"]);
  }),
  testBaseServices,
);

effectTest(
  "budgets become low, medium, high and max; effort wins over a budget; a toggle gives off and on",
  Effect.gen(function* () {
    const { catalog } = yield* startCatalog();
    const [sonnet, opus] = yield* infosOf(catalog, "anthropic");

    expect(sonnet?.thinking.map((option) => [option.id, option.value])).toEqual([
      ["low", ThinkingBudget.make({ tokens: 1024 })],
      ["medium", ThinkingBudget.make({ tokens: 15_999 })],
      ["high", ThinkingBudget.make({ tokens: 31_999 })],
      ["max", ThinkingBudget.make({ tokens: 63_999 })],
    ]);

    expect(sonnet?.thinking[0]?.label).toBe("low · 1,024 tokens");
    expect(opus?.thinking.map((option) => option.id)).toEqual(["low", "medium", "high", "max"]);
    expect(opus?.thinking[0]?.value).toEqual(ThinkingEffort.make({ effort: "low" }));

    const [toggled] = yield* infosOf(catalog, "deepinfra");

    expect(toggled?.thinking.map((option) => option.value)).toEqual([
      ThinkingOff.make({}),
      ThinkingOn.make({}),
    ]);
  }),
  testBaseServices,
);

effectTest(
  "a model on another protocol than its provider's names that protocol's package",
  Effect.gen(function* () {
    const { catalog } = yield* startCatalog();
    const models = yield* catalog.models("opencode-go");

    expect(models.map((model) => [model.info.id, model.package])).toEqual([
      ["glm-5.3", Option.none()],
      ["minimax-m3", Option.some("@ai-sdk/anthropic")],
    ]);
  }),
  testBaseServices,
);

effectTest(
  "an unreachable models.dev or an unknown catalog id is CatalogUnavailable",
  Effect.gen(function* () {
    const offline = yield* startCatalog(503);
    const down = yield* Effect.flip(offline.catalog.models("openai"));
    expect(Predicate.isTagged(down, "CatalogUnavailable")).toBe(true);

    const online = yield* startCatalog();
    const unknown = yield* Effect.flip(online.catalog.models("nowhere"));
    expect(unknown.message).toBe("models.dev lists no provider nowhere");
  }),
  testBaseServices,
);

effectTest(
  "a stale cache is available after restart while its daily refresh is blocked",
  Effect.gen(function* () {
    yield* (yield* startCatalog()).catalog.models("openai");
    yield* TestClock.adjust(Duration.days(2));

    const { catalog, requests } = yield* startBlockedCatalog;
    expect(yield* Queue.take(requests)).toBe("https://models.dev/api.json");

    const models = yield* infosOf(catalog, "openai").pipe(
      Effect.timeout(Duration.seconds(1)),
      TestClock.withLive,
    );

    expect(models.map((model) => model.id)).toEqual(["gpt-5.2", "gpt-4o"]);
  }),
  testBaseServices,
);

effectTest(
  "a cached provider does not wait for another provider's first fetch",
  Effect.gen(function* () {
    yield* (yield* startCatalog()).catalog.models("openai");
    const { catalog, requests } = yield* startBlockedCatalog;

    yield* Effect.forkScoped(catalog.models("anthropic"));
    yield* Queue.take(requests);

    const models = yield* infosOf(catalog, "openai").pipe(
      Effect.timeout(Duration.seconds(1)),
      TestClock.withLive,
    );

    expect(models.map((model) => model.id)).toEqual(["gpt-5.2", "gpt-4o"]);
  }),
  testBaseServices,
);

effectTest(
  "a fresh cache survives a restart without fetching",
  Effect.gen(function* () {
    yield* (yield* startCatalog()).catalog.models("openai");

    const fresh = yield* startCatalog();
    yield* fresh.catalog.models("openai");
    expect(yield* Queue.size(fresh.requests)).toBe(0);
  }),
  testBaseServices,
);
