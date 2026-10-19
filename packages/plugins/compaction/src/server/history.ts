/**
 * What compaction reads from a session's log: its checkpoints, its turns and the reply around a
 * call.
 */

import { Array as Arr, Option, Predicate, Schema } from "effect";

import type { Entry, ModelRef } from "@liminal/sdk";
import {
  ReasoningEntry,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  TurnSettings,
  TurnStartedEntry,
} from "@liminal/session-log/contract";

import { CheckpointData, CheckpointEntry, HandoffEntry } from "../contract.ts";

/** A checkpoint that counts: an automatic one, or the model's once its call is done. */
export interface Checkpoint {
  readonly entry: Entry;
  readonly data: CheckpointData;
}

const isCheckpointData = Schema.is(CheckpointData);

const decodeResult = Schema.decodeUnknownOption(
  Schema.Struct({ callId: Schema.String, status: Schema.String }),
);

const decodeCall = Schema.decodeUnknownOption(Schema.Struct({ id: Schema.String }));
const decodeHandoff = Schema.decodeUnknownOption(HandoffEntry.data);
const decodeSettings = Schema.decodeUnknownOption(TurnSettings);

/** The result entry of call `callId`. */
export const resultOf = (entries: ReadonlyArray<Entry>, callId: string): Option.Option<Entry> =>
  Arr.findFirst(
    entries,
    (entry) =>
      entry.kind === ToolResultEntry.kind
      && Option.exists(decodeResult(entry.data), (result) => result.callId === callId),
  );

const isDone = (entries: ReadonlyArray<Entry>, callId: string) =>
  Option.exists(
    Option.flatMap(resultOf(entries, callId), (result) => decodeResult(result.data)),
    ({ status }) => status === "done",
  );

/** The checkpoints that count, oldest first. */
export const checkpointsOf = (entries: ReadonlyArray<Entry>): ReadonlyArray<Checkpoint> =>
  entries.flatMap((entry) => {
    if (entry.kind !== CheckpointEntry.kind || !isCheckpointData(entry.data)) return [];

    const { trigger } = entry.data;
    if (Predicate.isTagged(trigger, "Model") && !isDone(entries, trigger.callId)) return [];

    return [{ entry, data: entry.data }];
  });

/** The newest checkpoint that counts. */
export const latestCheckpoint = (entries: ReadonlyArray<Entry>): Option.Option<Checkpoint> =>
  Arr.last(checkpointsOf(entries));

/** The handoff the model saved with `checkpoint`. */
export const handoffOf = (entries: ReadonlyArray<Entry>, checkpoint: Checkpoint) =>
  Option.map(
    Arr.findFirst(
      entries,
      (entry) => entry.kind === HandoffEntry.kind && entry.seq > checkpoint.entry.seq,
    ).pipe(Option.flatMap((entry) => decodeHandoff(entry.data))),
    ({ handoff }) => handoff,
  );

/** A turn's start and the model it ran on. */
export interface TurnStart {
  readonly entry: Entry;
  readonly model: ModelRef;
}

/** Every turn start, oldest first. */
export const turnStartsOf = (entries: ReadonlyArray<Entry>): ReadonlyArray<TurnStart> =>
  entries.flatMap((entry) =>
    entry.kind === TurnStartedEntry.kind
      ? Option.match(decodeSettings(entry.data), {
          onNone: () => [],
          onSome: ({ model }) => [{ entry, model }],
        })
      : [],
  );

export const isSameModel = (left: ModelRef, right: ModelRef): boolean =>
  left.provider === right.provider && left.id === right.id;

/** The seq of the newest turn start whose model differs from the turn before it; 0 for none. */
export const switchCutOf = (entries: ReadonlyArray<Entry>): number => {
  const starts = turnStartsOf(entries);

  const switched = starts.findLast(
    (start, index) =>
      index > 0 && !isSameModel(starts[index - 1]?.model ?? start.model, start.model),
  );

  return switched?.entry.seq ?? 0;
};

const REPLY_KINDS: ReadonlySet<string> = new Set([
  TextEntry.kind,
  ReasoningEntry.kind,
  ToolCallEntry.kind,
]);

/** Whether `entry` sits inside a reply: one of its parts, or a debug line saved between them. */
const isInReply = (entry: Entry) => REPLY_KINDS.has(entry.kind) || entry.user === "debug";

/** The parts of the reply that holds call `callId`, debug lines between them left out. */
export const replyAround = (
  entries: ReadonlyArray<Entry>,
  callId: string,
): ReadonlyArray<Entry> => {
  const index = entries.findIndex(
    (entry) =>
      entry.kind === ToolCallEntry.kind
      && Option.exists(decodeCall(entry.data), ({ id }) => id === callId),
  );

  if (index === -1) return [];

  const start = entries.findLastIndex((entry, at) => at < index && !isInReply(entry)) + 1;
  const after = entries.findIndex((entry, at) => at > index && !isInReply(entry));
  const end = after === -1 ? entries.length : after;

  return entries.slice(start, end).filter((entry) => REPLY_KINDS.has(entry.kind));
};

/** The id of a tool-call entry. */
export const callIdOf = (entry: Entry): Option.Option<string> =>
  entry.kind === ToolCallEntry.kind
    ? Option.map(decodeCall(entry.data), ({ id }) => id)
    : Option.none();
