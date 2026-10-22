/** The cache file: the catalog ids providers asked for, as models.dev last gave them. */
import { Effect, type FileSystem, Schema } from "effect";

import { ModelsDevProviders } from "./models-dev.ts";

export const CatalogCache = Schema.Struct({
  /** Milliseconds since the Unix epoch of the last fetch. */
  fetchedAt: Schema.Int,
  providers: ModelsDevProviders,
});

export type CatalogCache = typeof CatalogCache.Type;

const CacheJson = Schema.fromJsonString(CatalogCache);

/** No catalog ids, never fetched. */
const emptyCache: CatalogCache = { fetchedAt: 0, providers: {} };

/** The cache in `filename`; a missing file is empty, and so is one that does not decode, logged. */
export const readCache = Effect.fn("ModelCatalog.readCache")(function* (
  fs: FileSystem.FileSystem,
  filename: string,
) {
  if (!(yield* fs.exists(filename))) return emptyCache;

  return yield* fs.readFileString(filename).pipe(
    Effect.flatMap(Schema.decodeEffect(CacheJson)),
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning(`The model catalog cache ${filename} is unreadable`, error),
        emptyCache,
      ),
    ),
  );
});

export const writeCache = Effect.fn("ModelCatalog.writeCache")(function* (
  fs: FileSystem.FileSystem,
  filename: string,
  cache: CatalogCache,
) {
  yield* fs.writeFileString(filename, yield* Schema.encodeEffect(CacheJson)(cache));
});
