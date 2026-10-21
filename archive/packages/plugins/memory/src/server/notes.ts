/**
 * The note writer: the provider's small model summarizes each run of about 16,000 tokens of history
 * into a short-term note, then condenses older notes into one long-term memory.
 */

import { Array as Arr, Effect, Number as Num, Option, Schema } from "effect";

import { SystemEntry } from "@liminal/context/contract";
import type { Models, ModelTask } from "@liminal/models/contract";
import type { Entry, ModelContent, ModelPart, SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import { LineRange, type MemoryFile, NoteEntry } from "../contract.ts";
import { sumTokens, textTokens, tokensOf } from "./budget.ts";
import { type Candidate, candidatesOf, keptFound, labeled, mergeLists } from "./files.ts";
import { type Memories, type Memory, type Note, unfoldedNotes } from "./store.ts";

/** The tokens of history each note covers at most. */
const RANGE = 16_000;

/** Notes after the newest memory are condensed once they reach this many tokens. */
const CONDENSE = 30_000;

/** The tokens of newest notes left out of a condensed memory. */
const KEEP_OUT = 8_000;

/** What the writer reads and writes with. */
export interface NoteDeps {
  readonly log: SessionLog["Service"];
  readonly memories: Memories["Service"];
  readonly models: Models["Service"];
  readonly task: ModelTask["Service"];
  /** Whether `file`, relative to the workspace, exists. */
  readonly exists: (file: string) => Effect.Effect<boolean>;
}

const noFiles = <S extends Schema.Top>(schema: S) =>
  Schema.Array(schema).pipe(Schema.withDecodingDefaultKey(Effect.succeed([])));

const Label = Schema.Struct({
  path: Schema.String,
  relevant: Schema.Boolean.annotate({ description: "Whether the open work still needs it" }),
  reason: Schema.String.annotate({ description: "Why, in a few words" }),
});

const NoteAnswer = Schema.Struct({
  summary: Schema.String.check(Schema.isNonEmpty()).annotate({
    description: "The summary, at most about 2,000 tokens",
  }),
  labels: noFiles(Label).annotate({ description: "A label for each file in the list given" }),
  found: noFiles(Schema.Struct({ ...Label.fields, ranges: Schema.Array(LineRange) })).annotate({
    description:
      "Files not in the list that shell commands or their output read or changed, with the lines seen; no ranges for a whole file",
  }),
});

const MemoryAnswer = Schema.Struct({
  memory: Schema.String.check(Schema.isNonEmpty()).annotate({
    description: "The memory, at most about 4,000 tokens",
  }),
});

const noteSystem = [
  "You write short-term memory for a coding agent whose older history will be hidden from it.",
  "Summarize the entries you are given so the agent can keep working without them:",
  "- what the user asked for and every decision or preference they stated",
  "- files read or changed, with paths, and what changed",
  "- commands run and their results, errors included",
  "- what is done and what is still open",
  "Keep exact names, paths, numbers and errors. Leave out pleasantries and repeated content.",
  "Label each file in the list of files touched: relevant if the open work still needs it, with a reason in a few words.",
  "List under found any other file that shell commands or their output read or changed, with the lines seen.",
  "Then call submit_short_term once.",
].join("\n");

const memorySystem = [
  "You condense a coding agent's older short-term memories into one long-term memory.",
  "Keep what the agent still needs:",
  "- the user's requests, decisions and preferences",
  "- the current state of files, commands and open work",
  "Drop details that later memories replaced or that no longer matter.",
  "Then call submit_memory once.",
].join("\n");

/** Whether `entry` is history a note covers: model content other than the system prompt. */
const isNoted = (entry: Entry) => entry.model !== undefined && entry.kind !== SystemEntry.kind;

const partText = (part: ModelPart): Option.Option<string> => {
  if (part.type === "text") return Option.some(part.text);
  if (part.type === "reasoning") return Option.none();

  if (part.type === "tool-call")
    return Option.some(`Called ${part.name} ${JSON.stringify(part.params)}`);

  if (part.type === "image") return Option.some(`[image ${part.path}]`);
  if (part.type === "tool-change") return Option.some(`[tool ${part.tool.name}: ${part.change}]`);

  const verb = part.isFailure ? "failed" : "returned";

  return Option.some(`${part.name} ${verb}: ${JSON.stringify(part.result)}`);
};

const messageText = (seq: number, message: ModelContent) =>
  `#${seq} ${message.role}: ${Arr.getSomes(message.parts.map(partText)).join("\n")}`;

/** The entries as plain text, one block per message. */
export const historyText = (entries: ReadonlyArray<Entry>) =>
  entries
    .flatMap((entry) => (entry.model ?? []).map((message) => messageText(entry.seq, message)))
    .join("\n\n");

/** Applies one entry's calls and results to the set of calls still waiting on a result. */
const trackCalls = (open: Set<string>, entry: Entry) => {
  for (const message of entry.model ?? [])
    for (const part of message.parts) {
      if (part.type === "tool-call") open.add(part.id);
      if (part.type === "tool-result") open.delete(part.callId);
    }
};

/**
 * The next note's entries: as many as fit in `limit` tokens, ending where no call waits on its
 * result. One run bigger than `limit` becomes a note of its own.
 */
export const rangeOf = (entries: ReadonlyArray<Entry>, limit: number): ReadonlyArray<Entry> => {
  const open = new Set<string>();
  let tokens = 0;
  let end = 0;

  for (const [index, entry] of entries.entries()) {
    tokens += tokensOf(entry);
    if (tokens > limit && end > 0) break;

    trackCalls(open, entry);
    if (open.size === 0) end = index + 1;
  }

  return entries.slice(0, end);
};

/** The unfolded notes to condense: all but the newest, which stay out up to `KEEP_OUT` tokens. */
export const toCondense = (notes: ReadonlyArray<Note>): ReadonlyArray<Note> => {
  let kept = 0;
  let index = notes.length;

  while (index > 0 && kept + (notes[index - 1]?.tokens ?? 0) <= KEEP_OUT) {
    kept += notes[index - 1]?.tokens ?? 0;
    index -= 1;
  }

  return notes.slice(0, index);
};

const userText = (text: string): ReadonlyArray<ModelContent> => [
  { role: "user", parts: [{ type: "text", text, providerData: {} }] },
];

const tokensLabel = (tokens: number) => tokens.toLocaleString("en-US");

/** One session's writer: where it reads and writes, and how much each note covers. */
interface Writer {
  readonly deps: NoteDeps;
  readonly session: SessionId;
  readonly provider: string;
  /** The most tokens of history one note covers. */
  readonly range: number;
}

const ask = <S extends Schema.Top & { readonly DecodingServices: never }>(
  writer: Writer,
  system: string,
  prompt: string,
  submit: { readonly name: string; readonly schema: S },
) =>
  Effect.flatMap(writer.deps.models.cheap(writer.provider), (model) =>
    writer.deps.task.run({
      model,
      sessionId: writer.session,
      system,
      prompt: userText(prompt),
      tools: [],
      submit: { ...submit, description: "Saves your answer." },
      maxSteps: 1,
    }),
  );

const candidatesText = (candidates: ReadonlyArray<Candidate>) =>
  candidates.length === 0
    ? "Files touched: none"
    : [
        "Files touched:",
        ...candidates.map((file) => `- ${file.path}${file.edited ? " (changed)" : ""}`),
      ].join("\n");

/** The files that exist, so a deleted or made-up path never reaches a memory. */
const existing = (writer: Writer, files: ReadonlyArray<MemoryFile>) =>
  Effect.filter(files, (file) => writer.deps.exists(file.path), { concurrency: 8 });

const writeNote = Effect.fn("memory.writeNote")(function* (
  writer: Writer,
  covered: Arr.NonEmptyReadonlyArray<Entry>,
  all: ReadonlyArray<Entry>,
) {
  const from = Arr.headNonEmpty(covered).seq;
  const through = Arr.lastNonEmpty(covered).seq;
  const candidates = candidatesOf(all.filter((entry) => entry.seq >= from && entry.seq <= through));
  const history = historyText(covered);

  const answer = yield* ask(writer, noteSystem, `${history}\n\n${candidatesText(candidates)}`, {
    name: "submit_short_term",
    schema: NoteAnswer,
  });

  const found = yield* existing(writer, keptFound(answer.found, candidates, history, through));

  const note = yield* writer.deps.memories.addNote({
    session: writer.session,
    from,
    through,
    text: answer.summary,
    tokens: textTokens(answer.summary),
    files: [...labeled(candidates, answer.labels), ...found],
  });

  yield* writer.deps.log.append(writer.session, [
    {
      entry: NoteEntry,
      data: { layer: "short-term", from: note.from, through: note.through, tokens: note.tokens },
      text: `Short-term memory, entries ${note.from}–${note.through}, ${tokensLabel(note.tokens)} tokens`,
    },
  ]);
});

/** Writes the next note; false when the unnoted history is too short for one. */
const writeNext = Effect.fn("memory.writeNext")(function* (writer: Writer) {
  const notes = yield* writer.deps.memories.notes(writer.session);
  const after = Option.match(Arr.last(notes), { onNone: () => 0, onSome: (note) => note.through });
  const all = yield* writer.deps.log.read(writer.session, {});
  const unnoted = all.filter(isNoted).filter((entry) => entry.seq > after);
  if (sumTokens(unnoted) < writer.range) return false;

  const next = rangeOf(unnoted, writer.range);
  if (!Arr.isReadonlyArrayNonEmpty(next)) return false;

  yield* writeNote(writer, next, all);

  return true;
});

const memoryPrompt = (memory: Option.Option<Memory>, notes: ReadonlyArray<Note>) =>
  [
    ...Option.toArray(Option.map(memory, ({ text }) => `Previous memory:\n\n${text}`)),
    ...notes.map(
      (note) => `Short-term memory of entries ${note.from}–${note.through}:\n\n${note.text}`,
    ),
  ].join("\n\n");

/** Condenses older notes into a memory once the notes after the newest memory are long enough. */
const condense = Effect.fn("memory.condense")(function* (writer: Writer) {
  const { deps, session } = writer;
  const notes = yield* deps.memories.notes(session);
  const memory = Arr.last(yield* deps.memories.memories(session));
  const unfolded = unfoldedNotes(notes, memory);
  if (Num.sumAll(unfolded.map((note) => note.tokens)) < CONDENSE) return;

  const condensed = toCondense(unfolded);
  if (!Arr.isReadonlyArrayNonEmpty(condensed)) return;

  const answer = yield* ask(writer, memorySystem, memoryPrompt(memory, condensed), {
    name: "submit_memory",
    schema: MemoryAnswer,
  });

  const last = Arr.lastNonEmpty(condensed);

  const files = yield* existing(
    writer,
    mergeLists([
      Option.match(memory, { onNone: () => [], onSome: (previous) => previous.files }),
      ...condensed.map((note) => note.files),
    ]),
  );

  const saved = yield* deps.memories.addMemory({
    session,
    throughNote: last.number,
    throughSeq: last.through,
    text: answer.memory,
    tokens: textTokens(answer.memory),
    files,
  });

  const from = Option.match(Arr.head(notes), {
    onNone: () => last.from,
    onSome: (note) => note.from,
  });

  yield* deps.log.append(session, [
    {
      entry: NoteEntry,
      data: { layer: "long-term", from, through: saved.throughSeq, tokens: saved.tokens },
      text: `Long-term memory, entries ${from}–${saved.throughSeq}, ${tokensLabel(saved.tokens)} tokens`,
    },
  ]);
});

/**
 * Writes every note `session`'s history is due, then condenses. A small budget makes each note
 * cover less history. A failure stops until the next model call.
 */
export const noteWriter = (
  deps: NoteDeps,
  session: SessionId,
  provider: string,
  budget: number,
) => {
  const writer: Writer = { deps, session, provider, range: Math.min(RANGE, budget / 8) };

  return Effect.gen(function* () {
    while (yield* writeNext(writer)) yield* condense(writer);

    yield* condense(writer);
  }).pipe(Effect.catch((error) => Effect.logWarning("memory notes failed", error)));
};
