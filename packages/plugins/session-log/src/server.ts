/**
 * Session-log's server: the SessionLog and SessionFeed over the required SessionStore, the
 * EntryKinds registry, and the session commands clients call.
 */

import { Array as Arr, Context, DateTime, Effect, Layer, Option, PubSub, Stream } from "effect";

import {
  Directories,
  EventBus,
  KeyedRegistry,
  SessionFeed,
  SessionId,
  StoreError,
} from "@liminal/sdk";
import { SessionStore, type StoredSession } from "@liminal/session-store/contract";

import {
  coreEntries,
  EntryKinds,
  SessionLog,
  SessionLogRpcs,
  SessionsChanged,
  type SessionSummary,
} from "./contract.ts";
import { makeEntries } from "./server/entries-log.ts";
import { makeLive } from "./server/live.ts";

const toStoreError = (error: { readonly message: string; readonly cause: unknown }) =>
  new StoreError({ message: error.message, cause: error.cause });

const toSummary = (stored: StoredSession): SessionSummary => ({
  id: SessionId.make(stored.id),
  parentId: stored.parentId === null ? null : SessionId.make(stored.parentId),
  title: stored.title,
  createdAt: DateTime.makeUnsafe(stored.createdAt),
  updatedAt: DateTime.makeUnsafe(stored.updatedAt),
  lastSeq: stored.lastSeq,
});

const make = Effect.gen(function* () {
  const store = yield* SessionStore;
  const bus = yield* EventBus;
  const { workspace } = yield* Directories;

  const entryKinds = yield* EntryKinds;
  yield* Effect.forEach(coreEntries, entryKinds.register, { discard: true });

  const deps = {
    store,
    entryKinds,
    appended: yield* PubSub.sliding<SessionId>(64),
    liveChanges: yield* PubSub.sliding<SessionId>(64),
  };

  const { follow, ...entries } = makeEntries(deps);
  const live = makeLive(deps);

  const log = SessionLog.of({
    create: (session) =>
      store.createSession(session, workspace).pipe(
        Effect.mapError(toStoreError),
        Effect.tap(() => bus.publish(SessionsChanged, {})),
      ),
    list: store
      .listSessions(workspace)
      .pipe(Effect.map(Arr.map(toSummary)), Effect.mapError(toStoreError)),
    ...entries,
    ...live,
  });

  const feed = SessionFeed.of({
    follow,
    watchLive: (session) => live.watchLive(session).pipe(Stream.map(Option.fromNullishOr)),
  });

  return Context.make(SessionLog, log).pipe(Context.add(SessionFeed, feed));
});

const rpcs = SessionLogRpcs.toLayer(
  Effect.gen(function* () {
    const log = yield* SessionLog;

    return SessionLogRpcs.of({
      "session-log/create": ({ session }) => log.create(session),
      "session-log/list": () => log.list,
    });
  }),
);

export const layer = rpcs.pipe(
  Layer.provideMerge(Layer.effectContext(make)),
  Layer.provideMerge(KeyedRegistry.layer(EntryKinds, (definition) => definition.kind)),
);
