/** What a session's log says about its memory, read in one pass that every part of memory shares. */
import { type DateTime, Option } from "effect";

import { StepEnded, StepStarted } from "@shanepadgett/liminal-loop/contract";
import type { ModelId } from "@shanepadgett/liminal-model/contract";
import type { Seq, SessionEvent } from "@shanepadgett/liminal-session/contract";
import { PromptRecord } from "@shanepadgett/liminal-system-prompt/contract";
import { ToolListRecord } from "@shanepadgett/liminal-tool-definitions/contract";

import {
  type CheckpointMade as CheckpointData,
  CheckpointMade,
  Covers,
  type MemoryWritten as MemoryData,
  MemoryWritten,
  Nudge,
  type NudgeLevel,
} from "./contract.ts";

/**
 * Events that are no entry: memory's own, and the full system prompt and tool list, which reach the
 * model outside its messages.
 */
const NOT_ENTRIES: ReadonlySet<string> = new Set([
  MemoryWritten.kind,
  CheckpointMade.kind,
  Nudge.kind,
  PromptRecord.kind,
  ToolListRecord.kind,
]);

/** An event that is part of the work a memory sums up. */
export const isEntry = (event: SessionEvent) => !NOT_ENTRIES.has(event.kind);

export interface Memory {
  readonly seq: Seq;
  readonly data: MemoryData;
  /** The first entry it covers, directly or through the memories it compacts. */
  readonly start: Seq;
}

export interface LoggedCheckpoint {
  readonly seq: Seq;
  readonly data: CheckpointData;
}

/** The latest finished step since the latest checkpoint. */
export interface LastStep {
  readonly seq: Seq;
  readonly at: DateTime.Utc;
  readonly model: ModelId;
  /** Its input and output tokens, as the provider reported them. */
  readonly tokens: number;
}

export interface Scan {
  readonly checkpoint: Option.Option<LoggedCheckpoint>;
  readonly checkpoints: number;
  /** The memories no other memory covers, oldest first. */
  readonly memories: ReadonlyArray<Memory>;
  /** The entries after the last one a memory covers. */
  readonly uncovered: ReadonlyArray<SessionEvent>;
  /** The texts of the memories the latest checkpoint carries. */
  readonly carried: ReadonlyArray<string>;
  /** The entries the model sees now: from the latest checkpoint's `from` on, else all. */
  readonly context: ReadonlyArray<SessionEvent>;
  readonly lastStep: Option.Option<LastStep>;
  /** The entries after `lastStep`. */
  readonly since: ReadonlyArray<SessionEvent>;
  /** The latest nudge since the latest checkpoint. */
  readonly nudge: Option.Option<NudgeLevel>;
}

const checkpointsOf = (events: ReadonlyArray<SessionEvent>): ReadonlyArray<LoggedCheckpoint> =>
  events.flatMap((event) =>
    Option.match(CheckpointMade.decodeOption(event), {
      onNone: () => [],
      onSome: (data) => [{ seq: event.seq, data }],
    }),
  );

/** Every memory, in log order, with the first entry each covers. */
const allMemories = (events: ReadonlyArray<SessionEvent>): ReadonlyArray<Memory> => {
  const starts = new Map<Seq, Seq>();
  const memories: Memory[] = [];

  for (const event of events) {
    const data = MemoryWritten.decodeOption(event);
    if (Option.isNone(data)) continue;

    const start = Covers.match(data.value.covers, {
      Entries: ({ from }) => from,
      Memories: ({ seqs }) => Math.min(...seqs.map((seq) => starts.get(seq) ?? seq)),
    });

    starts.set(event.seq, start);
    memories.push({ seq: event.seq, data: data.value, start });
  }

  return memories;
};

const coveredMemories = (memories: ReadonlyArray<Memory>): ReadonlySet<Seq> =>
  new Set(
    memories.flatMap(({ data }) =>
      Covers.match(data.covers, { Entries: () => [], Memories: ({ seqs }) => seqs }),
    ),
  );

/** The last entry a memory covers; -1 before the first memory. */
const lastCoveredEntry = (memories: ReadonlyArray<Memory>) =>
  Math.max(
    -1,
    ...memories.map(({ data }) =>
      Covers.match(data.covers, { Entries: ({ to }) => to, Memories: () => -1 }),
    ),
  );

const tokensOf = (usage: typeof StepEnded.schema.Type) =>
  usage.outcome === "finished"
    ? (usage.usage.inputTokens.total ?? 0) + (usage.usage.outputTokens.total ?? 0)
    : 0;

const isFinished = (event: SessionEvent) =>
  Option.exists(StepEnded.decodeOption(event), ({ outcome }) => outcome === "finished");

/** The latest finished step after `after`, and the model its start names. */
const lastStepOf = (events: ReadonlyArray<SessionEvent>, after: Seq): Option.Option<LastStep> => {
  const ended = events.findLast((event) => event.seq > after && isFinished(event));
  if (ended === undefined) return Option.none();

  const started = events.findLast(
    (event) => event.seq < ended.seq && event.kind === StepStarted.kind,
  );

  return Option.flatMap(Option.fromNullishOr(started), (event) =>
    Option.map(StepStarted.decodeOption(event), ({ model }) => ({
      seq: ended.seq,
      at: ended.at,
      model,
      tokens: Option.match(StepEnded.decodeOption(ended), { onNone: () => 0, onSome: tokensOf }),
    })),
  );
};

const nudgeOf = (events: ReadonlyArray<SessionEvent>, after: Seq) =>
  Option.flatMap(
    Option.fromNullishOr(
      events.findLast((event) => event.seq > after && event.kind === Nudge.kind),
    ),
    (event) => Option.map(Nudge.decodeOption(event), ({ level }) => level),
  );

/** What `events`, a session's whole log, say about its memory. */
export const scan = (events: ReadonlyArray<SessionEvent>): Scan => {
  const checkpoints = checkpointsOf(events);
  const checkpoint = Option.fromNullishOr(checkpoints.at(-1));
  const memories = allMemories(events);
  const covered = coveredMemories(memories);
  const lastCovered = lastCoveredEntry(memories);
  const entries = events.filter(isEntry);
  const after = Option.match(checkpoint, { onNone: () => -1, onSome: ({ seq }) => seq });
  const from = Option.match(checkpoint, { onNone: () => -1, onSome: ({ data }) => data.from });
  const lastStep = lastStepOf(events, after);
  const stepSeq = Option.match(lastStep, { onNone: () => after, onSome: ({ seq }) => seq });
  const texts = new Map(memories.map((memory) => [memory.seq, memory.data.text]));

  const carried = Option.match(checkpoint, {
    onNone: () => [],
    onSome: ({ data }) => data.memories,
  });

  return {
    checkpoint,
    checkpoints: checkpoints.length,
    memories: memories
      .filter((memory) => !covered.has(memory.seq))
      .toSorted((first, second) => first.start - second.start),
    uncovered: entries.filter((event) => event.seq > lastCovered),
    carried: carried.flatMap((seq) => texts.get(seq) ?? []),
    context: entries.filter((event) => event.seq >= from),
    lastStep,
    since: entries.filter((event) => event.seq > stepSeq),
    nudge: nudgeOf(events, after),
  };
};
