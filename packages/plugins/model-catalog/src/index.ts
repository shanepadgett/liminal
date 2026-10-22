/**
 * `catalog.json` in the global folder: read at start, refreshed from models.dev in the background
 * when older than a day, and fetched at once for a catalog id it lacks.
 */
import {
  Clock,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Path,
  Record,
  Ref,
  Schema,
  Semaphore,
} from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { CatalogUnavailable, ModelCatalog } from "@shanepadgett/liminal-model/contract";

import { type CatalogCache, readCache, writeCache } from "./cache.ts";
import { catalogModels, ModelsDevProviders } from "./models-dev.ts";

const apiUrl = "https://models.dev/api.json";

/** How old the cache may get before a background refresh. */
const maxAge = Duration.days(1);

/** Models.dev could not be fetched or read. */
class FetchFailed extends Schema.TaggedError<FetchFailed, { readonly brand: unique symbol }>()(
  "FetchFailed",
  { message: Schema.String },
) {}

/** The cache and what reading and saving it needs. */
interface Store {
  readonly fs: FileSystem.FileSystem;
  readonly http: HttpClient.HttpClient;
  readonly folder: string;
  readonly filename: string;
  readonly cache: Ref.Ref<CatalogCache>;
  readonly lock: Semaphore.Semaphore;
}

/** Models.dev's providers named in `ids`; the full list is several megabytes, so keep only these. */
const fetchProviders = (http: HttpClient.HttpClient, ids: ReadonlyArray<string>) =>
  http.get(apiUrl).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(ModelsDevProviders)),
    Effect.map((all) => Record.filter(all, (_provider, id) => ids.includes(id))),
    Effect.mapError((error) => new FetchFailed({ message: `models.dev: ${error.message}` })),
  );

/** Fetches `ids`, then keeps and saves them; a failed save is logged and the fetch still kept. */
const refresh = Effect.fn("ModelCatalog.refresh")(function* (
  store: Store,
  ids: ReadonlyArray<string>,
) {
  const fetched: CatalogCache = {
    fetchedAt: yield* Clock.currentTimeMillis,
    providers: yield* fetchProviders(store.http, ids),
  };

  yield* Ref.set(store.cache, fetched);

  yield* store.fs.makeDirectory(store.folder, { recursive: true }).pipe(
    Effect.andThen(writeCache(store.fs, store.filename, fetched)),
    Effect.catch((error) => Effect.logWarning(`Could not save ${store.filename}`, error)),
  );
});

/** Rechecks under the lock so concurrent misses fetch once. */
const fetchMissing = (store: Store, catalogId: string) =>
  Effect.gen(function* () {
    const known = (yield* Ref.get(store.cache)).providers;
    if (!(catalogId in known)) yield* refresh(store, [...Object.keys(known), catalogId]);

    const found = (yield* Ref.get(store.cache)).providers[catalogId];
    if (found !== undefined) return found.models;

    return yield* new FetchFailed({ message: `models.dev lists no provider ${catalogId}.` });
  }).pipe(
    store.lock.withPermits(1),
    Effect.mapError((error) => new CatalogUnavailable({ catalogId, message: error.message })),
  );

/** Refreshes a cache older than a day in the background; cached reads go on meanwhile. */
const refreshIfStale = Effect.fn("ModelCatalog.refreshIfStale")(function* (store: Store) {
  const { fetchedAt, providers } = yield* Ref.get(store.cache);
  const ids = Object.keys(providers);
  const isStale = (yield* Clock.currentTimeMillis) - fetchedAt > Duration.toMillis(maxAge);

  if (ids.length === 0 || !isStale) return;

  yield* Effect.forkScoped(
    refresh(store, ids).pipe(
      store.lock.withPermits(1),
      Effect.catch((error) => Effect.logWarning("The model catalog refresh failed", error)),
    ),
  );
});

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const folder = (yield* Directories).global;
  const filename = (yield* Path.Path).join(folder, "catalog.json");

  const store: Store = {
    fs,
    http: yield* HttpClient.HttpClient,
    folder,
    filename,
    cache: yield* Ref.make(yield* readCache(fs, filename)),
    lock: yield* Semaphore.make(1),
  };

  yield* refreshIfStale(store);

  /** Cached reads never wait for a refresh or another provider's first fetch. */
  const entries = Effect.fn("ModelCatalog.entries")(function* (catalogId: string) {
    const found = (yield* Ref.get(store.cache)).providers[catalogId];
    if (found !== undefined) return found.models;

    return yield* fetchMissing(store, catalogId);
  });

  return ModelCatalog.of({ models: (catalogId) => Effect.map(entries(catalogId), catalogModels) });
});

export default definePlugin({
  name: "model-catalog",
  provides: [ModelCatalog],
  requires: [Directories, FileSystem.FileSystem, Path.Path, HttpClient.HttpClient],
  layer: Layer.effect(ModelCatalog, make),
});
