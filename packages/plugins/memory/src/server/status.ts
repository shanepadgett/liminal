/** The status the sidebar's Context section shows, measured again after each change to the log. */

import { Array as Arr, Duration, Effect, Option, Stream } from "effect";

import type { SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import type { MemoryStatus } from "../contract.ts";
import { checkpointsOf, turnStartsOf } from "./history.ts";
import { type MeasureDeps, measure } from "./measure.ts";

/** What the status reads with. */
export type StatusDeps = MeasureDeps & { readonly log: SessionLog["Service"] };

/** Entries saved together, such as a reply's parts or the history on subscribing, measure once. */
const SETTLE = Duration.millis(100);

/** The session's status; none before its first turn, which names the model to measure against. */
const statusOf = Effect.fn("memory.statusOf")(function* (deps: StatusDeps, session: SessionId) {
  const entries = yield* deps.log
    .read(session, {})
    .pipe(Effect.catchTag("SessionNotFound", () => Effect.succeed([])));

  const start = Arr.last(turnStartsOf(entries));
  if (Option.isNone(start)) return [];

  const measured = yield* measure(deps, session, entries, start.value.model);

  const status: MemoryStatus = {
    size: measured.size,
    budget: measured.budget,
    stage: measured.stage,
    shortTerm: measured.stored.notes.length,
    longTerm: measured.stored.memories.length,
    checkpoints: checkpointsOf(entries).length,
  };

  return [status];
});

/** The session's status now, then after each burst of new entries; a failed measure is skipped. */
export const watchStatus = (deps: StatusDeps, session: SessionId) =>
  deps.log.subscribe(session, {}).pipe(
    Stream.debounce(SETTLE),
    Stream.mapEffect(() =>
      statusOf(deps, session).pipe(
        Effect.catch((error) =>
          Effect.as(Effect.logWarning(`memory status skipped: ${error.message}`), []),
        ),
      ),
    ),
    Stream.flattenIterable,
    Stream.catch((error) =>
      Stream.fromEffect(Effect.logWarning(`memory status ended: ${error.message}`)).pipe(
        Stream.drain,
      ),
    ),
  );
