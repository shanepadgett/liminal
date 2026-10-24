/**
 * `models.json` in the global folder: each signed-in provider's last model list, so the list shows
 * at once. A list older than a day refreshes in the background, a provider never listed is fetched
 * at once, and a signed-out provider's list is dropped.
 */
import {
  Clock,
  Duration,
  Effect,
  FileSystem,
  Path,
  Record,
  Ref,
  Schema,
  type Scope,
  Semaphore,
} from "effect";

import type { Registry } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";

import { detailsOf } from "./call.ts";
import { type ModelCatalog, ModelId, type ModelInfo, type ModelProvider } from "./contract.ts";

/** How old a provider's list may get before a background refresh. */
const maxAge = Duration.days(1);

const ProviderList = Schema.Struct({
  /** Milliseconds since the Unix epoch of the last fetch. */
  fetchedAt: Schema.Int,
  models: Schema.Array(Schema.Struct({ id: ModelId, name: Schema.String })),
});

type ProviderList = typeof ProviderList.Type;

/** Lists by provider id. */
const ListCache = Schema.Struct({ providers: Schema.Record(Schema.String, ProviderList) });

type ListCache = typeof ListCache.Type;

const ListCacheJson = Schema.fromJsonString(ListCache);

/** The cache file, the lists in it, and the providers refreshing in the background. */
interface Store {
  readonly fs: FileSystem.FileSystem;
  readonly folder: string;
  readonly filename: string;
  readonly cache: Ref.Ref<ListCache>;
  readonly lock: Semaphore.Semaphore;
  readonly refreshing: Ref.Ref<ReadonlySet<string>>;
  readonly scope: Scope.Scope;
}

/** The lists in `filename`; none when it is missing, and none, logged, when it does not decode. */
const load = Effect.fn("Models.loadLists")(function* (fs: FileSystem.FileSystem, filename: string) {
  const none: ListCache = { providers: {} };
  if (!(yield* fs.exists(filename))) return none;

  return yield* fs.readFileString(filename).pipe(
    Effect.flatMap(Schema.decodeEffect(ListCacheJson)),
    Effect.catch((error) =>
      Effect.as(Effect.logWarning(`The model list cache ${filename} is unreadable`, error), none),
    ),
  );
});

/** Sets or drops `providerId`'s list, then saves every list; a failed save is logged. */
const keep = (store: Store, providerId: string, list?: ProviderList) =>
  Effect.gen(function* () {
    yield* Ref.update(store.cache, ({ providers }) => ({
      providers:
        list === undefined
          ? Record.remove(providers, providerId)
          : Record.set(providers, providerId, list),
    }));

    yield* store.fs.makeDirectory(store.folder, { recursive: true });
    const text = yield* Schema.encodeEffect(ListCacheJson)(yield* Ref.get(store.cache));
    yield* store.fs.writeFileString(store.filename, text);
  }).pipe(
    store.lock.withPermits(1),
    Effect.catch((error) => Effect.logWarning(`Could not save ${store.filename}`, error)),
  );

/** Asks `provider` for its models and keeps them. */
const fetchList = Effect.fn("Models.fetchList")(function* (store: Store, provider: ModelProvider) {
  const models = yield* provider.models;

  const list: ProviderList = {
    fetchedAt: yield* Clock.currentTimeMillis,
    models: models.map(({ id, name }) => ({ id, name })),
  };

  yield* keep(store, provider.id, list);

  return list;
});

/** Refreshes `provider`'s list in the background, once at a time; a failure keeps the old list. */
const refreshLater = Effect.fn("Models.refreshLater")(function* (
  store: Store,
  provider: ModelProvider,
) {
  const claimed = yield* Ref.modify(store.refreshing, (ids) =>
    ids.has(provider.id) ? [false, ids] : [true, new Set([...ids, provider.id])],
  );

  if (!claimed) return;

  const done = Ref.update(
    store.refreshing,
    (ids) => new Set([...ids].filter((id) => id !== provider.id)),
  );

  yield* fetchList(store, provider).pipe(
    Effect.catch((error) => Effect.logWarning(`Refreshing ${provider.name} models failed`, error)),
    Effect.ensuring(done),
    Effect.forkIn(store.scope),
  );
});

/** `provider`'s models: cached when it can, fetched when never listed, none when signed out. */
const listed = Effect.fn("Models.listed")(function* (store: Store, provider: ModelProvider) {
  const cached = (yield* Ref.get(store.cache)).providers[provider.id];

  if (!(yield* provider.signedIn)) {
    if (cached !== undefined) yield* keep(store, provider.id);

    return [];
  }

  if (cached === undefined) return (yield* fetchList(store, provider)).models;

  const isStale = (yield* Clock.currentTimeMillis) - cached.fetchedAt > Duration.toMillis(maxAge);
  if (isStale) yield* refreshLater(store, provider);

  return cached.models;
});

/** `provider`'s models with their details from the catalog; none, logged, when its list fails. */
const listOf = (store: Store, catalog: ModelCatalog["Service"], provider: ModelProvider) =>
  Effect.gen(function* () {
    const models = yield* listed(store, provider);
    if (models.length === 0) return [];

    const details = yield* detailsOf(catalog, provider);
    const prefix = `${provider.id}/`;

    return models.map(({ id, name }): ModelInfo => ({
      id,
      name,
      details: details.get(id.slice(prefix.length)),
    }));
  }).pipe(
    Effect.catch((error) =>
      Effect.as(Effect.logWarning(`Listing ${provider.name} models failed`, error), []),
    ),
  );

/** `models.json` read at start; background refreshes run until the layer closes. */
export const openLists = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const folder = (yield* Directories).global;
  const filename = (yield* Path.Path).join(folder, "models.json");

  return {
    fs,
    folder,
    filename,
    cache: yield* Ref.make(yield* load(fs, filename)),
    lock: yield* Semaphore.make(1),
    refreshing: yield* Ref.make<ReadonlySet<string>>(new Set()),
    scope: yield* Effect.scope,
  } satisfies Store;
});

/** Every signed-in provider's models, from `lists` when it has them. */
export const listModels = (
  lists: Store,
  providers: Registry<ModelProvider>,
  catalog: ModelCatalog["Service"],
) =>
  Effect.flatMap(providers.list, (all) =>
    Effect.map(
      Effect.forEach(all, (provider) => listOf(lists, catalog, provider), {
        concurrency: "unbounded",
      }),
      (each) => each.flat(),
    ),
  );
