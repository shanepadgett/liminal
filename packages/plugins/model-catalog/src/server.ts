/**
 * Model-catalog's server: `catalog.json` in the data folder, read at start, refreshed from
 * models.dev in the background when older than a day, and fetched at once for a catalog id it
 * lacks.
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
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";

import { CatalogUnavailable, Directories } from "@liminal/sdk";

import { ModelCatalog } from "./contract.ts";
import { type CatalogCache, readCache, writeCache } from "./server/cache.ts";
import { modelInfos, ModelsDevProviders } from "./server/models-dev.ts";

export const apiUrl = "https://models.dev/api.json";

/** How old the cache may get before a background refresh. */
const maxAge = Duration.days(1);

/** Models.dev could not be fetched or read. */
class FetchFailed extends Schema.TaggedError<FetchFailed, { readonly brand: unique symbol }>()(
  "FetchFailed",
  { message: Schema.String },
) {}

/** Models.dev's providers named in `ids`. */
const fetchProviders = (http: HttpClient.HttpClient, ids: ReadonlyArray<string>) =>
  http.get(apiUrl).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(ModelsDevProviders)),
    Effect.map((all) => Record.filter(all, (_provider, id) => ids.includes(id))),
    Effect.mapError((error) => new FetchFailed({ message: `models.dev: ${error.message}` })),
  );

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const http = yield* HttpClient.HttpClient;
  const filename = path.join((yield* Directories).data, "catalog.json");
  const cache = yield* Ref.make<CatalogCache>(yield* readCache(fs, filename));
  const lock = yield* Semaphore.make(1);

  /** Fetches `ids`, then keeps and saves them; a failed save is logged and the fetch still kept. */
  const refresh = Effect.fn("ModelCatalog.refresh")(function* (ids: ReadonlyArray<string>) {
    const providers = yield* fetchProviders(http, ids);
    const fetched: CatalogCache = { fetchedAt: yield* Clock.currentTimeMillis, providers };
    yield* Ref.set(cache, fetched);

    yield* writeCache(fs, filename, fetched).pipe(
      Effect.catch((error) => Effect.logWarning(`Could not save ${filename}`, error)),
    );
  });

  /** The cached entries for `catalogId`, fetching every known id and it when it is missing. */
  const entries = (catalogId: string) =>
    Effect.gen(function* () {
      const known = (yield* Ref.get(cache)).providers;
      if (!(catalogId in known)) yield* refresh([...Object.keys(known), catalogId]);

      const found = (yield* Ref.get(cache)).providers[catalogId];
      if (found !== undefined) return found.models;

      return yield* new FetchFailed({ message: `models.dev lists no provider ${catalogId}` });
    }).pipe(
      lock.withPermits(1),
      Effect.mapError((error) => new CatalogUnavailable({ catalogId, message: error.message })),
    );

  const start = yield* Ref.get(cache);
  const ids = Object.keys(start.providers);
  const age = (yield* Clock.currentTimeMillis) - start.fetchedAt;

  if (ids.length > 0 && age > Duration.toMillis(maxAge)) {
    yield* Effect.forkScoped(
      refresh(ids).pipe(
        lock.withPermits(1),
        Effect.catch((error) => Effect.logWarning("The model catalog refresh failed", error)),
      ),
    );
  }

  return ModelCatalog.of({ models: (catalogId) => Effect.map(entries(catalogId), modelInfos) });
});

/** The catalog over a given HTTP client, which tests replace. */
export const catalogLayer = Layer.effect(ModelCatalog, make);

export const layer = catalogLayer.pipe(Layer.provide(FetchHttpClient.layer));
