/**
 * A followed session as the chat screen draws it: shown and debug entries in order, runs of tool
 * calls gathered into work items, the live state, and whether a turn runs. Each event makes a new
 * value; items it does not touch keep their identity, so their rows stay mounted.
 */

import { Option, Predicate, Schema } from "effect";

import type { FollowEvent, LiveState, SavedEntry } from "@liminal/sdk";
import {
  ToolCallEntry,
  ToolResultEntry,
  TurnEndedEntry,
  TurnStartedEntry,
} from "@liminal/session-log/contract";

import type { ToolCall, ToolOutcome } from "../contract.ts";

/** One thing in the transcript: an entry its kind's registration draws, or a run of tool calls. */
export type Item =
  | { readonly kind: "entry"; readonly entry: SavedEntry }
  | { readonly kind: "work"; readonly seq: number; readonly calls: ReadonlyArray<ToolCall> };

export interface Transcript {
  readonly items: ReadonlyArray<Item>;
  readonly live: LiveState | undefined;
  readonly running: boolean;
  /** Whether every saved entry has arrived. */
  readonly synced: boolean;
}

export const emptyTranscript: Transcript = {
  items: [],
  live: undefined,
  running: false,
  synced: false,
};

const decodeCall = Schema.decodeUnknownOption(ToolCallEntry.data);
const decodeResult = Schema.decodeUnknownOption(ToolResultEntry.data);

const isDebug = (item: Item) => item.kind === "entry" && item.entry.user === "debug";

/** A call joins the last run even past debug items, so a debug entry never splits a run. */
const withCall = (transcript: Transcript, entry: SavedEntry, call: ToolCall): Transcript => {
  const index = transcript.items.findLastIndex((item) => !isDebug(item));
  const last = transcript.items[index];

  if (last?.kind === "work") {
    const joined: Item = { ...last, calls: [...last.calls, call] };

    return { ...transcript, items: transcript.items.with(index, joined) };
  }

  const started: Item = { kind: "work", seq: entry.seq, calls: [call] };

  return { ...transcript, items: [...transcript.items, started] };
};

const withResult = (
  transcript: Transcript,
  result: typeof ToolResultEntry.data.Type,
): Transcript => {
  const index = transcript.items.findLastIndex(
    (item) => item.kind === "work" && item.calls.some((call) => call.id === result.callId),
  );

  const item = transcript.items[index];
  if (item?.kind !== "work") return transcript;

  const { status, details } = result;

  const outcome: ToolOutcome =
    details === undefined
      ? { status, result: result.result }
      : { status, result: result.result, details };

  const calls = item.calls.map((call) => (call.id === result.callId ? { ...call, outcome } : call));
  const items = transcript.items.with(index, { ...item, calls });

  return { ...transcript, items };
};

const withTool = (transcript: Transcript, entry: SavedEntry): Transcript | undefined => {
  if (entry.kind === ToolCallEntry.kind) {
    return Option.match(decodeCall(entry.data), {
      onNone: () => transcript,
      onSome: ({ id, name, params }) => withCall(transcript, entry, { id, name, params }),
    });
  }

  if (entry.kind === ToolResultEntry.kind) {
    return Option.match(decodeResult(entry.data), {
      onNone: () => transcript,
      onSome: (result) => withResult(transcript, result),
    });
  }

  return undefined;
};

const withEntry = (transcript: Transcript, entry: SavedEntry): Transcript => {
  if (entry.kind === TurnStartedEntry.kind) return { ...transcript, running: true };
  if (entry.kind === TurnEndedEntry.kind) return { ...transcript, running: false };

  const tool = withTool(transcript, entry);
  if (tool !== undefined) return tool;
  if (entry.user === "hidden") return transcript;

  return { ...transcript, items: [...transcript.items, { kind: "entry", entry }] };
};

/** The transcript after one followed event. */
export const fold = (transcript: Transcript, event: FollowEvent): Transcript => {
  if (Predicate.isTagged(event, "Saved")) return withEntry(transcript, event.entry);
  if (Predicate.isTagged(event, "Synced")) return { ...transcript, synced: true };

  return { ...transcript, live: event.live };
};
