/** Session-log's server: the SessionLog over the required SessionStore, and the EntryKinds registry. */

import { Effect, Layer, PubSub } from "effect";

import { KeyedRegistry, type SessionId, StoreError } from "@liminal/sdk";
import { SessionStore } from "@liminal/session-store/contract";

import { EntryKinds, SessionLog } from "./contract.ts";
import { makeEntries } from "./server/entries-log.ts";
import { makeLive } from "./server/live.ts";

const make = Effect.gen(function* () {
  const store = yield* SessionStore;

  const deps = {
    store,
    entryKinds: yield* EntryKinds,
    appended: yield* PubSub.sliding<SessionId>(64),
    liveChanges: yield* PubSub.sliding<SessionId>(64),
  };

  return SessionLog.of({
    create: (session) =>
      store
        .createSession(session)
        .pipe(
          Effect.mapError(
            (error) => new StoreError({ message: error.message, cause: error.cause }),
          ),
        ),
    ...makeEntries(deps),
    ...makeLive(deps),
  });
});

export const layer = Layer.effect(SessionLog, make).pipe(
  Layer.provideMerge(KeyedRegistry.layer(EntryKinds, (definition) => definition.kind)),
);
