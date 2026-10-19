/**
 * The view step: from the latest checkpoint the model sees its memory and notes, the entries they
 * do not cover, its handoff, then what follows. System prompt entries before the newest checkpoint
 * or model switch are dropped, so the context sends a fresh baseline.
 */

import { Option, Predicate } from "effect";

import { SystemEntry } from "@liminal/context/contract";
import { type Entry, type ModelContent, reminder } from "@liminal/sdk";
import { ReasoningEntry, ToolCallEntry } from "@liminal/session-log/contract";

import {
  type Checkpoint,
  handoffOf,
  latestCheckpoint,
  replyAround,
  resultOf,
  switchCutOf,
} from "./history.ts";
import type { Memory, Note } from "./store.ts";

/** A session's notes and memories, as the store holds them. */
export interface Stored {
  readonly notes: ReadonlyArray<Note>;
  readonly memories: ReadonlyArray<Memory>;
}

/** The kind of the messages the view step builds; they are never saved. */
const BUILT_KIND = "compaction/memory";

/** A user message built in the step, placed at the checkpoint. */
const built = (checkpoint: Entry, text: string, isCacheEnd: boolean): Entry => {
  const message: ModelContent = { role: "user", parts: [{ type: "text", text, providerData: {} }] };

  return {
    sessionId: checkpoint.sessionId,
    seq: checkpoint.seq,
    kind: BUILT_KIND,
    at: checkpoint.at,
    data: {},
    model: [isCacheEnd ? { ...message, cache: "breakpoint" } : message],
    text,
    user: "hidden",
  };
};

/** The memory and note texts the checkpoint uses, oldest first. */
const rememberedTexts = (checkpoint: Checkpoint, stored: Stored): ReadonlyArray<string> => {
  const { longTerm, shortTerm } = checkpoint.data;
  const memory = stored.memories.find((each) => each.number === longTerm);
  const notes = stored.notes.filter((note) => shortTerm.includes(note.number));

  return [
    ...(memory === undefined
      ? []
      : [
          reminder(
            "memory",
            `Long-term memory of entries 1–${memory.throughSeq}:\n\n${memory.text}`,
          ),
        ]),
    ...notes.map((note) =>
      reminder("memory", `Entries ${note.from}–${note.through}:\n\n${note.text}`),
    ),
  ];
};

/** The seqs a model checkpoint leaves out: its call, the reasoning before it and its result. */
const checkpointCall = (entries: ReadonlyArray<Entry>, checkpoint: Checkpoint) => {
  const { trigger } = checkpoint.data;
  if (!Predicate.isTagged(trigger, "Model")) return new Set<number>();

  const reply = replyAround(entries, trigger.callId).filter(
    (entry) => entry.kind === ReasoningEntry.kind || entry.kind === ToolCallEntry.kind,
  );

  const result = Option.toArray(resultOf(entries, trigger.callId));

  return new Set([...reply, ...result].map((entry) => entry.seq));
};

/** The view folded at `checkpoint`. */
const foldAt = (entries: ReadonlyArray<Entry>, checkpoint: Checkpoint, stored: Stored) => {
  const at = checkpoint.entry.seq;
  const left = checkpointCall(entries, checkpoint);
  const isKept = (entry: Entry) => !left.has(entry.seq);
  const texts = rememberedTexts(checkpoint, stored);

  const handoff = Option.match(handoffOf(entries, checkpoint), {
    onNone: () => [],
    onSome: (text) => [
      built(
        checkpoint.entry,
        `Your handoff at the checkpoint:\n\n${text}\n\nCheckpoint completed.`,
        false,
      ),
    ],
  });

  return [
    ...texts.map((text, index) => built(checkpoint.entry, text, index === texts.length - 1)),
    ...entries.filter(
      (entry) => entry.seq >= checkpoint.data.tailFrom && entry.seq < at && isKept(entry),
    ),
    ...handoff,
    ...entries.filter((entry) => entry.seq > at && isKept(entry)),
  ];
};

/** What the model sees of `entries`, the whole log of a session. */
export const viewOf = (entries: ReadonlyArray<Entry>, stored: Stored): ReadonlyArray<Entry> => {
  const latest = latestCheckpoint(entries);

  const cut = Math.max(
    switchCutOf(entries),
    Option.match(latest, { onNone: () => 0, onSome: ({ entry }) => entry.seq }),
  );

  const kept = entries.filter((entry) => entry.kind !== SystemEntry.kind || entry.seq >= cut);

  return Option.match(latest, {
    onNone: () => kept,
    onSome: (checkpoint) => foldAt(kept, checkpoint, stored),
  });
};

/** The seq the view's size counts replies after: the latest checkpoint's, or 0. */
export const measuredSince = (entries: ReadonlyArray<Entry>): number =>
  Option.match(latestCheckpoint(entries), { onNone: () => 0, onSome: ({ entry }) => entry.seq });
