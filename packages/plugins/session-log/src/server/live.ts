/** A session's live slot: saving it, reading it and following its changes. */

import { Effect, PubSub, Schema, Stream } from "effect";

import type { StoredLive } from "@liminal/session-store/contract";

import { type LiveState, type SessionId, StoreError } from "../contract.ts";
import { fromStore, type LogDeps } from "./deps.ts";

const LiveData = Schema.fromJsonString(Schema.Json);

export const makeLive = (deps: LogDeps) => {
  const setLive = Effect.fn("SessionLog.setLive")(function* (session: SessionId, live?: LiveState) {
    const stored =
      live === undefined
        ? undefined
        : {
            kind: live.kind,
            data: yield* Schema.encodeEffect(LiveData)(live.data).pipe(Effect.orDie),
          };

    yield* fromStore(deps.store.writeLive(session, stored));

    yield* PubSub.publish(deps.liveChanges, { session, live });
  });

  const readLive = Effect.fn("SessionLog.readLive")(function* (session: SessionId) {
    const stored = yield* fromStore(deps.store.readLive(session));

    const malformed = (cause: Schema.SchemaError) =>
      new StoreError({ message: `the live slot of ${session} is malformed`, cause });

    const decode = (saved: StoredLive) =>
      Effect.map(
        Effect.mapError(Schema.decodeEffect(LiveData)(saved.data), malformed),
        (data): LiveState => ({ kind: saved.kind, data }),
      );

    return stored === undefined ? undefined : yield* decode(stored);
  });

  /** Subscribes and reads under the write lock, so no change lands between the two. */
  const watchLive = (session: SessionId) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const changes = yield* PubSub.subscribe(deps.liveChanges);
        const current = yield* readLive(session);

        const followed = Stream.fromSubscription(changes).pipe(
          Stream.filter((change) => change.session === session),
          Stream.map((change) => change.live),
        );

        return Stream.succeed(current).pipe(Stream.concat(followed));
      }).pipe((effect) => deps.lock.withPermit(effect)),
    );

  return {
    setLive: (session: SessionId, live?: LiveState) => deps.lock.withPermit(setLive(session, live)),
    watchLive,
  };
};
