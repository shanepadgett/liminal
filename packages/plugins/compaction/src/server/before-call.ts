/**
 * Before each model call: starts the note writer, writes an automatic checkpoint when the
 * provider's cache is already lost, and nudges the model once each time its context crosses a
 * stage.
 */

import { Array as Arr, DateTime, Duration, Effect, FiberMap, Option, Schema } from "effect";

import { BeforeCall, type BeforeCallHook } from "@liminal/agent-loop/contract";
import { contextMessage, MessageEntry } from "@liminal/context/contract";
import { type Entry, type ModelRef, reminder, type SessionId } from "@liminal/sdk";

import { IdleTrigger, SwitchTrigger, type Trigger } from "../contract.ts";
import { finishOf, isAtLeast, type Stage, STAGES } from "./budget.ts";
import { type CheckpointDeps, covered, saveCheckpoint } from "./checkpoint.ts";
import { isSameModel, latestCheckpoint, turnStartsOf } from "./history.ts";
import { type MeasureDeps, type Measured, measure } from "./measure.ts";
import { type NoteDeps, noteWriter } from "./notes.ts";
import { measuredSince } from "./view.ts";

/** Everything compaction's server reads and writes with. */
export type CompactionDeps = CheckpointDeps & MeasureDeps & NoteDeps;

/** The label of compaction's messages to the model. */
const LABEL = "compaction";

const NUDGES: Readonly<Record<Exclude<Stage, "none">, string>> = {
  notice: reminder(
    "context",
    "Your context is half full. At the next natural break, such as after finishing a task, call checkpoint.",
  ),
  warning: reminder(
    "context",
    "Your context is three quarters full. Call checkpoint at the next natural break.",
  ),
  forced: reminder(
    "context",
    "Your context is full. Call checkpoint now; every other tool is denied until you do.",
  ),
};

const decodeMessage = Schema.decodeUnknownOption(MessageEntry.data);

/** The highest stage nudged after `since`. */
const lastNudged = (entries: ReadonlyArray<Entry>, since: number): Stage => {
  const texts = new Set(
    entries.flatMap((entry) => {
      if (entry.seq <= since || entry.kind !== MessageEntry.kind) return [];

      return Option.match(decodeMessage(entry.data), {
        onNone: () => [],
        onSome: ({ label, text }) => (label === LABEL ? [text] : []),
      });
    }),
  );

  return STAGES.findLast((stage) => stage !== "none" && texts.has(NUDGES[stage])) ?? "none";
};

/** The model the turn before the current one ran on, when the current one has no reply yet. */
const switchedFrom = (entries: ReadonlyArray<Entry>, model: ModelRef): Option.Option<ModelRef> => {
  const starts = turnStartsOf(entries);
  const current = Arr.last(starts);
  const previous = Option.fromUndefinedOr(starts.at(-2));
  if (Option.isNone(current) || Option.isNone(previous)) return Option.none();

  const replied = entries.some(
    (entry) => entry.seq > current.value.entry.seq && Option.isSome(finishOf(entry)),
  );

  return replied || isSameModel(previous.value.model, model)
    ? Option.none()
    : Option.some(previous.value.model);
};

/** The time since the last reply, when it is past the provider's cache lifetime. */
const idleFor = Effect.fn("compaction.idleFor")(function* (
  deps: CompactionDeps,
  entries: ReadonlyArray<Entry>,
  provider: string,
) {
  const last = Arr.findLast(entries, (entry) => Option.isSome(finishOf(entry)));
  if (Option.isNone(last)) return Option.none<Duration.Duration>();

  const idle = Duration.millis(
    DateTime.toEpochMillis(yield* DateTime.now) - DateTime.toEpochMillis(last.value.at),
  );

  const lifetime = yield* deps.models.cacheLifetime(provider);

  return Duration.isGreaterThanOrEqualTo(idle, lifetime) ? Option.some(idle) : Option.none();
});

/** The automatic checkpoint due now: notes cover more than the latest one, and the cache is lost. */
const dueTrigger = Effect.fn("compaction.dueTrigger")(function* (
  deps: CompactionDeps,
  measured: Measured,
  model: ModelRef,
) {
  if (!isAtLeast(measured.stage, "notice")) return Option.none<Trigger>();

  const coveredFrom = Option.match(latestCheckpoint(measured.entries), {
    onNone: () => 1,
    onSome: ({ data }) => data.tailFrom,
  });

  if (covered(measured.stored).tailFrom <= coveredFrom) return Option.none<Trigger>();

  const from = switchedFrom(measured.entries, model);
  if (Option.isSome(from)) return Option.some<Trigger>(SwitchTrigger.make({ from: from.value }));

  const idle = yield* idleFor(deps, measured.entries, model.provider);

  return Option.map(idle, (each): Trigger =>
    IdleTrigger.make({ idleSeconds: Math.floor(Duration.toSeconds(each)) }),
  );
});

/** The hook, with the writers it starts kept in `writers` while the server runs. */
export const beforeCallOf =
  (deps: CompactionDeps, writers: FiberMap.FiberMap<SessionId>): BeforeCallHook =>
  ({ sessionId, settings }) =>
    Effect.gen(function* () {
      const { model } = settings;

      const read = Effect.flatMap(deps.log.read(sessionId, {}), (entries) =>
        measure(deps, sessionId, entries, model),
      );

      const first = yield* read;

      yield* FiberMap.run(
        writers,
        sessionId,
        noteWriter(deps, sessionId, model.provider, first.budget),
        { onlyIfMissing: true },
      );

      const trigger = yield* dueTrigger(deps, first, model);
      if (Option.isSome(trigger)) yield* saveCheckpoint(deps, sessionId, trigger.value);

      const measured = Option.isSome(trigger) ? yield* read : first;
      const { stage } = measured;

      if (
        stage === "none"
        || isAtLeast(lastNudged(measured.entries, measuredSince(measured.entries)), stage)
      )
        return BeforeCall.Proceed({ input: [] });

      return BeforeCall.Proceed({
        input: [contextMessage({ label: LABEL, text: NUDGES[stage], user: "debug" })],
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.as(
          Effect.logWarning("compaction failed before the call", error),
          BeforeCall.Proceed({ input: [] }),
        ),
      ),
    );
