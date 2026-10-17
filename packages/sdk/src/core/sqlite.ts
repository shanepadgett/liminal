/** Helpers for plugins that keep their state in SQLite. */

import { Effect, Predicate, Schedule } from "effect";
import { SqlError } from "effect/sql";

/**
 * Retries `effect` every 20 ms, for up to 30 s, while the database is locked. Bun's SQLite waits
 * for a busy database by blocking the thread, which would stall the holder when it is another build
 * in this process during a graph change; so clients set `busyTimeout: 0` and wait through this.
 */
export const whileLocked = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.retry(effect, {
    while: (error: E) =>
      SqlError.isSqlError(error) && Predicate.isTagged(error.reason, "LockTimeoutError"),
    schedule: Schedule.spaced("20 millis").pipe(Schedule.upTo({ duration: "30 seconds" })),
  });
