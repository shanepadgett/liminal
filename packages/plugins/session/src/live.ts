/** Live updates for the sessions this process writes to. */
import { Duration, Effect, PubSub, RcMap, Semaphore } from "effect";

import type { Delta, LiveItem, SessionId } from "./contract.ts";

/** A session's live updates in this process. */
export interface Watched {
  /** Held by each append, publish and the start of each `live`, so none sees half of another. */
  readonly lock: Semaphore.Semaphore;
  readonly updates: PubSub.PubSub<LiveItem>;
  /** The deltas published since the last append, for a viewer that joins mid-reply. */
  readonly deltas: Array<Delta>;
}

const lookup = (): Effect.Effect<Watched> =>
  Effect.gen(function* () {
    return {
      lock: yield* Semaphore.make(1),
      updates: yield* PubSub.unbounded<LiveItem>(),
      deltas: [],
    };
  });

/**
 * Each session's live updates, held while in use. One unused for an hour is dropped, which no
 * turn's pause between deltas comes near, so a viewer joining mid-reply still sees its deltas.
 */
export const makeWatched = RcMap.make<SessionId, Watched, never, never>({
  lookup,
  idleTimeToLive: Duration.hours(1),
});
