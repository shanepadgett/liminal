/** Session-log's server: the SessionLog over the required SessionStore, and the EntryKinds registry. */

import { Effect, Layer, PubSub, Semaphore } from "effect";

import { Registry } from "@liminal/sdk";
import { SessionStore } from "@liminal/session-store/contract";

import { EntryKinds, type SessionId, SessionLog, StoreError } from "./contract.ts";
import type { LiveChange } from "./server/deps.ts";
import { makeEntries } from "./server/entries-log.ts";
import { makeLive } from "./server/live.ts";

const make = Effect.gen(function* () {
  const store = yield* SessionStore;

  const deps = {
    store,
    entryKinds: yield* EntryKinds,
    lock: yield* Semaphore.make(1),
    appended: yield* PubSub.sliding<SessionId>(64),
    liveChanges: yield* PubSub.sliding<LiveChange>(64),
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
  Layer.provideMerge(Registry.layer(EntryKinds)),
);
