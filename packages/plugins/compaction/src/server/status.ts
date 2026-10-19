/** The status the sidebar's Compaction section shows, measured again after each change to the log. */

import { Array as Arr, Duration, Effect, Option, Stream } from "effect";

import type { SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import type { CompactionStatus } from "../contract.ts";
import { checkpointsOf, turnStartsOf } from "./history.ts";
import { type MeasureDeps, measure } from "./measure.ts";

/** What the status reads with. */
export type StatusDeps = MeasureDeps & { readonly log: SessionLog["Service"] };

/** Entries saved together, such as a reply's parts or the history on subscribing, measure once. */
const SETTLE = Duration.millis(100);

/** The session's status; none before its first turn, which names the model to measure against. */
const statusOf = Effect.fn("compaction.statusOf")(function* (deps: StatusDeps, session: SessionId) {
  const entries = yield* deps.log.read(session, {});
  const start = Arr.last(turnStartsOf(entries));
  if (Option.isNone(start)) return [];

  const measured = yield* measure(deps, session, entries, start.value.model);
  const lastNote = Arr.last(measured.stored.notes);

  const status: CompactionStatus = {
    size: measured.size,
    budget: measured.budget,
    stage: measured.stage,
    checkpoints: checkpointsOf(entries).length,
    ...Option.match(lastNote, {
      onNone: () => ({}),
      onSome: (note) => ({ notesThrough: note.through }),
    }),
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
          Effect.as(Effect.logWarning(`compaction status skipped: ${error.message}`), []),
        ),
      ),
    ),
    Stream.flattenIterable,
    Stream.catch((error) =>
      Stream.fromEffect(Effect.logWarning(`compaction status ended: ${error.message}`)).pipe(
        Stream.drain,
      ),
    ),
  );
