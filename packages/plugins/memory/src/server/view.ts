/**
 * The view step: from the latest checkpoint the model sees its memory and notes, the entries they
 * do not cover, its handoff, then what follows. System prompt entries before the newest checkpoint
 * or model switch are dropped, so the context sends a fresh baseline.
 */

import { Array as Arr, Option, Predicate, Schema } from "effect";

import { SystemEntry } from "@liminal/context/contract";
import { type Entry, type ModelContent, reminder } from "@liminal/sdk";
import { NamedEntry, ReasoningEntry, ToolCallEntry } from "@liminal/session-log/contract";

import { filesText } from "./files.ts";
import {
  type Checkpoint,
  handoffOf,
  latestCheckpoint,
  replyAround,
  restoredOf,
  resultOf,
  switchCutOf,
} from "./history.ts";
import { restoredText } from "./restore.ts";
import type { Memory, Note } from "./store.ts";

/** A session's notes and memories, as the store holds them. */
export interface Stored {
  readonly notes: ReadonlyArray<Note>;
  readonly memories: ReadonlyArray<Memory>;
}

/** The kind of the messages the view step builds; they are never saved. */
const BUILT_KIND = "memory/built";

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

/** A memory's summary, then its file list. */
const withFiles = (text: string, files: Note["files"]) =>
  files.length === 0 ? text : `${text}\n\n${filesText(files)}`;

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
            `Long-term memory of entries 1–${memory.throughSeq}:\n\n${withFiles(memory.text, memory.files)}`,
          ),
        ]),
    ...notes.map((note) =>
      reminder(
        "memory",
        `Short-term memory of entries ${note.from}–${note.through}:\n\n${withFiles(note.text, note.files)}`,
      ),
    ),
  ];
};

/** The files the checkpoint read back, one reminder each, then the paths it left out. */
const restoredTexts = (entries: ReadonlyArray<Entry>, checkpoint: Checkpoint) =>
  Option.match(restoredOf(entries, checkpoint), {
    onNone: () => [],
    onSome: ({ files, leftOut }) => [
      ...files.map((file) => reminder("files", restoredText(file))),
      ...(leftOut.length === 0
        ? []
        : [
            reminder(
              "files",
              [
                "Relevant files not read back, to stay within the context budget; read them when you need them:",
                ...leftOut.map((path) => `- ${path}`),
              ].join("\n"),
            ),
          ]),
    ],
  });

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

const decodeNamed = Schema.decodeUnknownOption(NamedEntry.data);

/** The session's current name, from its newest named entry, wherever it sits in the log. */
const nameIn = (entries: ReadonlyArray<Entry>) =>
  Arr.findLast(entries, (entry) => entry.kind === NamedEntry.kind).pipe(
    Option.flatMap((entry) => decodeNamed(entry.data)),
    Option.map((data) => data.name),
  );

/** The view folded at `checkpoint`. */
const foldAt = (entries: ReadonlyArray<Entry>, checkpoint: Checkpoint, stored: Stored) => {
  const at = checkpoint.entry.seq;
  const left = checkpointCall(entries, checkpoint);
  const isKept = (entry: Entry) => !left.has(entry.seq);
  const texts = [...rememberedTexts(checkpoint, stored), ...restoredTexts(entries, checkpoint)];

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

  const name = Option.match(nameIn(entries), {
    onNone: () => [],
    onSome: (text) => [built(checkpoint.entry, `Session name: ${text}`, false)],
  });

  return [
    ...texts.map((text, index) => built(checkpoint.entry, text, index === texts.length - 1)),
    ...entries.filter(
      (entry) => entry.seq >= checkpoint.data.tailFrom && entry.seq < at && isKept(entry),
    ),
    ...handoff,
    ...name,
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
