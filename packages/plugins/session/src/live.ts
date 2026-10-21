/** Live updates for the sessions this process writes to. */
import { Effect, PubSub, Semaphore } from "effect";

import type { Delta, LiveItem, SessionId } from "./contract.ts";

/** A session's live updates in this process. */
export interface Watched {
  /** Held by each append, publish and the start of each `live`, so none sees half of another. */
  readonly lock: Semaphore.Semaphore;
  readonly updates: PubSub.PubSub<LiveItem>;
  /** The deltas published since the last append, for a viewer that joins mid-reply. */
  readonly deltas: Array<Delta>;
}

/** Finds or starts each session's live updates. */
export const makeWatch = Effect.gen(function* () {
  const watched = new Map<SessionId, Watched>();
  const starting = yield* Semaphore.make(1);

  return (session: SessionId) =>
    starting.withPermits(1)(
      Effect.gen(function* () {
        const existing = watched.get(session);
        if (existing !== undefined) return existing;

        const created: Watched = {
          lock: yield* Semaphore.make(1),
          updates: yield* PubSub.unbounded<LiveItem>(),
          deltas: [],
        };

        watched.set(session, created);

        return created;
      }),
    );
});
