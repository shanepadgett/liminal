/**
 * A followed session as the chat screen draws it: shown and debug entries in order, runs of
 * thoughts and tool calls gathered into work items, the live state, and whether a turn runs. Each
 * event makes a new value; items it does not touch keep their identity, so their rows stay
 * mounted.
 */

import { Option, Predicate, Schema } from "effect";

import type { FollowEvent, LiveState, SavedEntry } from "@liminal/sdk";
import {
  InnerCallEntry,
  ReasoningEntry,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  TurnEndedEntry,
  TurnStartedEntry,
  UserEntry,
} from "@liminal/session-log/contract";

import type { ToolCall, ToolOutcome } from "../contract.ts";

/** One step of the assistant's work: a tool call, or what it thought. */
export type Step =
  | { readonly kind: "call"; readonly call: ToolCall }
  | { readonly kind: "thought"; readonly text: string };

/**
 * One thing in the transcript: an entry its kind's registration draws, or a run of thoughts and
 * tool calls.
 */
export type Item =
  | { readonly kind: "entry"; readonly entry: SavedEntry }
  | { readonly kind: "work"; readonly seq: number; readonly steps: ReadonlyArray<Step> };

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
const decodeInner = Schema.decodeUnknownOption(InnerCallEntry.data);
const decodeThought = Schema.decodeUnknownOption(ReasoningEntry.data);

const isDebug = (item: Item) => item.kind === "entry" && item.entry.user === "debug";

/** A step joins the last run even past debug items, so a debug entry never splits a run. */
const withStep = (transcript: Transcript, entry: SavedEntry, step: Step): Transcript => {
  const index = transcript.items.findLastIndex((item) => !isDebug(item));
  const last = transcript.items[index];

  if (last?.kind === "work") {
    const joined: Item = { ...last, steps: [...last.steps, step] };

    return { ...transcript, items: transcript.items.with(index, joined) };
  }

  const started: Item = { kind: "work", seq: entry.seq, steps: [step] };

  return { ...transcript, items: [...transcript.items, started] };
};

const outcomeOf = (result: {
  readonly status: ToolOutcome["status"];
  readonly result: Schema.Json;
  readonly details?: Schema.Json;
}): ToolOutcome =>
  result.details === undefined
    ? { status: result.status, result: result.result }
    : { status: result.status, result: result.result, details: result.details };

/** `transcript` with the call `id` in its last run changed by `change`. */
const withChangedCall = (
  transcript: Transcript,
  id: string,
  change: (call: ToolCall) => ToolCall,
): Transcript => {
  const isCalled = (step: Step) => step.kind === "call" && step.call.id === id;

  const index = transcript.items.findLastIndex(
    (item) => item.kind === "work" && item.steps.some(isCalled),
  );

  const item = transcript.items[index];
  if (item?.kind !== "work") return transcript;

  const steps = item.steps.map((step): Step =>
    step.kind === "call" && isCalled(step) ? { ...step, call: change(step.call) } : step,
  );

  return { ...transcript, items: transcript.items.with(index, { ...item, steps }) };
};

const withResult = (transcript: Transcript, result: typeof ToolResultEntry.data.Type) =>
  withChangedCall(transcript, result.callId, (call) => ({ ...call, outcome: outcomeOf(result) }));

/** Adds an inner call, finished, under the call it ran inside. */
const withInner = (transcript: Transcript, inner: typeof InnerCallEntry.data.Type) => {
  const added: ToolCall = {
    id: inner.id,
    name: inner.name,
    params: inner.params,
    outcome: outcomeOf(inner),
  };

  return withChangedCall(transcript, inner.outer, (call) => ({
    ...call,
    inner: [...(call.inner ?? []), added],
  }));
};

const withTool = (transcript: Transcript, entry: SavedEntry): Transcript | undefined => {
  if (entry.kind === InnerCallEntry.kind) {
    return Option.match(decodeInner(entry.data), {
      onNone: () => transcript,
      onSome: (inner) => withInner(transcript, inner),
    });
  }

  if (entry.kind === ToolCallEntry.kind) {
    return Option.match(decodeCall(entry.data), {
      onNone: () => transcript,
      onSome: ({ id, name, params }) =>
        withStep(transcript, entry, { kind: "call", call: { id, name, params } }),
    });
  }

  if (entry.kind === ReasoningEntry.kind) {
    return Option.match(decodeThought(entry.data), {
      onNone: () => transcript,
      onSome: ({ text }) =>
        text.trim() === "" ? transcript : withStep(transcript, entry, { kind: "thought", text }),
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

const isSpoken = (item: Item) =>
  item.kind === "entry"
  && (item.entry.kind === TextEntry.kind || item.entry.kind === UserEntry.kind);

/**
 * Whether the item at `index` is left behind: the turn is over, or the assistant or the user has
 * spoken since.
 */
export const isLeftBehind = (transcript: Transcript, index: number) =>
  !transcript.running || transcript.items.slice(index + 1).some(isSpoken);

/** The transcript after one followed event. */
export const fold = (transcript: Transcript, event: FollowEvent): Transcript => {
  if (Predicate.isTagged(event, "Saved")) return withEntry(transcript, event.entry);
  if (Predicate.isTagged(event, "Synced")) return { ...transcript, synced: true };

  return { ...transcript, live: event.live };
};
