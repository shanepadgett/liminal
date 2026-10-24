/**
 * `catalog.json` in the global folder: read at start, refreshed from models.dev in the background
 * when a read finds it older than an hour, and fetched at once for a catalog id it lacks.
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
  type Scope,
  Semaphore,
} from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { CatalogUnavailable, ModelCatalog } from "@shanepadgett/liminal-model/contract";

import { type CatalogCache, readCache, writeCache } from "./cache.ts";
import { catalogModels, ModelsDevProviders } from "./models-dev.ts";

const apiUrl = "https://models.dev/api.json";

/**
 * How old the cache may get before a read starts a background refresh, and how long a failed one
 * waits.
 */
const maxAge = Duration.hours(1);

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
  /** Milliseconds since the Unix epoch of the last fetch or refresh attempt. */
  readonly tried: Ref.Ref<number>;
  readonly scope: Scope.Scope;
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
  yield* Ref.set(store.tried, fetched.fetchedAt);

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
    if (found !== undefined) return found;

    return yield* new FetchFailed({ message: `models.dev lists no provider ${catalogId}.` });
  }).pipe(
    store.lock.withPermits(1),
    Effect.mapError((error) => new CatalogUnavailable({ catalogId, message: error.message })),
  );

/**
 * Refreshes in the background when the last attempt is over an hour old, once at a time; cached
 * reads go on meanwhile, and a failure keeps the old cache.
 */
const refreshIfStale = Effect.fn("ModelCatalog.refreshIfStale")(function* (store: Store) {
  const ids = Object.keys((yield* Ref.get(store.cache)).providers);
  if (ids.length === 0) return;

  const now = yield* Clock.currentTimeMillis;

  const claimed = yield* Ref.modify(store.tried, (tried) =>
    now - tried > Duration.toMillis(maxAge) ? [true, now] : [false, tried],
  );

  if (!claimed) return;

  yield* refresh(store, ids).pipe(
    store.lock.withPermits(1),
    Effect.catch((error) => Effect.logWarning("The model catalog refresh failed", error)),
    Effect.forkIn(store.scope),
  );
});

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const folder = (yield* Directories).global;
  const filename = (yield* Path.Path).join(folder, "catalog.json");

  const cached = yield* readCache(fs, filename);

  const store: Store = {
    fs,
    http: yield* HttpClient.HttpClient,
    folder,
    filename,
    cache: yield* Ref.make(cached),
    lock: yield* Semaphore.make(1),
    tried: yield* Ref.make(cached.fetchedAt),
    scope: yield* Effect.scope,
  };

  yield* refreshIfStale(store);

  /** Cached reads never wait for a refresh or another provider's first fetch. */
  const entries = Effect.fn("ModelCatalog.entries")(function* (catalogId: string) {
    yield* refreshIfStale(store);
    const found = (yield* Ref.get(store.cache)).providers[catalogId];
    if (found !== undefined) return found;

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
