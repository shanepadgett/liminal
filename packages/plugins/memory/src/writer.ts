/**
 * The writer: one fiber a session that sums up the oldest uncovered entries with the small model,
 * one range at a time, and compacts the memories once they grow too long.
 */
import {
  Array as Arr,
  Effect,
  Fiber,
  FiberMap,
  Match,
  Option,
  Schema,
  Stream,
  SubscriptionRef,
} from "effect";

import type { History } from "@shanepadgett/liminal-history/contract";
import type { SessionModel } from "@shanepadgett/liminal-loop/contract";
import type { Message, ModelId, Models, Part } from "@shanepadgett/liminal-model/contract";
import {
  MessageEvent,
  type SessionEvent,
  type SessionId,
  type SessionLog,
} from "@shanepadgett/liminal-session/contract";

import { Covers, MemoryWritten } from "./contract.ts";
import {
  COMPACT_AT,
  COMPACT_MAX,
  estimate,
  estimateEvents,
  estimateTexts,
  KEEP_OUT,
  RANGE,
} from "./measure.ts";
import { type Memory, scan } from "./scan.ts";

const WRITE_SYSTEM = `You write memories for a coding agent. Its older history is about to be hidden from it, and your memories are what it keeps of that history.

Write one memory of the entries you are given, in the agent's own voice, as notes to itself ("The user wants...", "I changed..."). Keep:
- what the user asked for, and every decision and preference they stated
- files read or changed, with paths, and what changed
- commands run and their results, errors included
- what is done and what is still open

Keep exact names, paths, numbers and errors. Leave out pleasantries and anything repeated. The earlier memories are there for context; do not repeat them.

\`line\` is a few words saying what this stretch was, such as "Found why the loop retries twice". \`text\` is the memory, at most about 1,500 words.`;

const COMPACT_SYSTEM = `You compact a coding agent's older memories into one memory, in the agent's own voice. Keep what it still needs:
- the user's requests, decisions and preferences
- the current state of files, commands and open work

Drop details that later memories replaced or that no longer matter. Keep exact names, paths, numbers and errors.

\`line\` is a few words saying what the memories cover. \`text\` is the memory, at most about 4,000 words.`;

const STRICTER = "\n\nYour last answer was too long. Keep `text` under 2,500 words.";

const Answer = Schema.Struct({
  line: Schema.String.annotate({ description: "A few words saying what the memory covers" }),
  text: Schema.String.annotate({ description: "The memory" }),
});

type Answer = typeof Answer.Type;

/** The ids of the tool calls `event` asks for, and of the calls it answers. */
const callsOf = (event: SessionEvent) => {
  const parts = Option.match(MessageEvent.decodeOption(event), {
    onNone: () => [],
    onSome: (message) => message.parts,
  });

  return {
    asked: parts.flatMap((part) => (part.type === "tool-call" ? [part.id] : [])),
    answered: parts.flatMap((part) => (part.type === "tool-result" ? [part.callId] : [])),
  };
};

/**
 * The oldest uncovered entries, from about `RANGE` tokens on, cut where no tool call waits for its
 * result; none while fewer are uncovered.
 */
export const rangeOf = (
  uncovered: ReadonlyArray<SessionEvent>,
): Option.Option<Arr.NonEmptyReadonlyArray<SessionEvent>> => {
  const open = new Set<string>();
  let tokens = 0;

  for (const [index, event] of uncovered.entries()) {
    const { asked, answered } = callsOf(event);
    for (const id of asked) open.add(id);
    for (const id of answered) open.delete(id);
    tokens += estimateEvents([event]);

    if (open.size > 0 || tokens < RANGE) continue;

    const range = uncovered.slice(0, index + 1);
    if (Arr.isReadonlyArrayNonEmpty(range)) return Option.some(range);
  }

  return Option.none();
};

/** One part as plain text; reasoning is left out. */
const partText: (part: Part) => string = Match.type<Part>().pipe(
  Match.discriminatorsExhaustive("type")({
    text: (part) => part.text,
    reasoning: () => "",
    image: () => "[image]",
    "tool-call": (part) => `[call ${part.name} ${JSON.stringify(part.params)}]`,
    "tool-result": (part) =>
      `[${part.isFailure ? "failed " : ""}result of ${part.name}]\n${part.content.map(partText).join("\n")}`,
    "tool-change": (part) =>
      `[tools added: ${part.added.map(({ name }) => name).join(", ")}; removed: ${part.removed.join(", ")}]`,
  }),
);

/** Messages as plain text for the small model. */
const textOf = (messages: ReadonlyArray<Message>) =>
  messages
    .map(
      ({ role, parts }) =>
        `${role}:\n${parts
          .map(partText)
          .filter((text) => text !== "")
          .join("\n")}`,
    )
    .join("\n\n");

/** The newest memories, up to `KEEP_OUT` tokens, oldest first. */
const newest = (memories: ReadonlyArray<Memory>): ReadonlyArray<Memory> => {
  const kept: Memory[] = [];
  let tokens = 0;

  for (const memory of memories.toReversed()) {
    tokens += estimate(memory.data.text);
    if (tokens > KEEP_OUT) break;
    kept.unshift(memory);
  }

  return kept;
};

const memoriesText = (memories: ReadonlyArray<Memory>) =>
  memories.map(({ data }) => `<memory>\n${data.text}\n</memory>`).join("\n");

/** The memories to compact, all but the newest; none until they pass `COMPACT_AT`. */
const compactionOf = (memories: ReadonlyArray<Memory>): Option.Option<ReadonlyArray<Memory>> => {
  if (estimateTexts(memories.map(({ data }) => data.text)) <= COMPACT_AT) return Option.none();

  const kept = new Set(newest(memories).map(({ seq }) => seq));
  const compacted = memories.filter(({ seq }) => !kept.has(seq));

  return compacted.length < 2 ? Option.none() : Option.some(compacted);
};

export interface WriterServices {
  readonly log: SessionLog["Service"];
  readonly models: Models["Service"];
  readonly history: History["Service"];
  readonly sessionModel: SessionModel["Service"];
}

export interface Writer {
  /** Starts the session's writer unless it runs; it writes what is due, then stops. */
  readonly start: (session: SessionId) => Effect.Effect<void>;
  /** Waits for a running writer, then writes what is due before it returns. */
  readonly settle: (session: SessionId) => Effect.Effect<void>;
  /** Whether the small model is writing for the session, now and after each change. */
  readonly writing: (session: SessionId) => Stream.Stream<boolean>;
}

const makeWrite = (services: WriterServices) => {
  const { log, models, history } = services;

  const ask = (main: ModelId, system: string, prompt: string) =>
    models.generateObject({
      model: "small",
      main,
      system,
      prompt: [{ type: "text", text: prompt }],
      schema: Answer,
    });

  const save = (session: SessionId, covers: Covers, answer: Answer) =>
    Effect.flatMap(MemoryWritten.make({ covers, ...answer }), (event) =>
      log.append(session, [event]),
    );

  const writeRange = Effect.fn("Memory.writeRange")(function* (
    session: SessionId,
    range: Arr.NonEmptyReadonlyArray<SessionEvent>,
    memories: ReadonlyArray<Memory>,
    main: ModelId,
  ) {
    const entries = textOf(yield* history.run(range));
    const prompt = `<memories>\n${memoriesText(newest(memories))}\n</memories>\n\n<entries>\n${entries}\n</entries>`;

    const covers = Covers.cases.Entries.make({
      from: Arr.headNonEmpty(range).seq,
      to: Arr.lastNonEmpty(range).seq,
    });

    yield* save(session, covers, yield* ask(main, WRITE_SYSTEM, prompt));
  });

  const compact = Effect.fn("Memory.compact")(function* (
    session: SessionId,
    memories: ReadonlyArray<Memory>,
    main: ModelId,
  ) {
    const prompt = `<memories>\n${memoriesText(memories)}\n</memories>`;
    const first = yield* ask(main, COMPACT_SYSTEM, prompt);

    const answer =
      estimate(first.text) > COMPACT_MAX
        ? yield* ask(main, COMPACT_SYSTEM + STRICTER, prompt)
        : first;

    const covers = Covers.cases.Memories.make({ seqs: memories.map(({ seq }) => seq) });

    yield* save(session, covers, answer);
  });

  return { writeRange, compact };
};

export const makeWriter = Effect.fn("Memory.makeWriter")(function* (services: WriterServices) {
  const { log, sessionModel } = services;
  const fibers = yield* FiberMap.make<SessionId>();
  const busy = yield* SubscriptionRef.make<ReadonlySet<SessionId>>(new Set());
  const { writeRange, compact } = makeWrite(services);

  const busyWhile = <A, E>(session: SessionId, effect: Effect.Effect<A, E>) =>
    SubscriptionRef.update(busy, (now) => new Set(now).add(session)).pipe(
      Effect.andThen(effect),
      Effect.ensuring(
        SubscriptionRef.update(busy, (now) => new Set([...now].filter((id) => id !== session))),
      ),
    );

  /** Writes one range or one compaction; false when nothing is due. */
  const writeNext = Effect.fn("Memory.writeNext")(function* (session: SessionId) {
    const events = yield* log.read(session);
    const scanned = scan(events);
    const range = rangeOf(scanned.uncovered);
    const compacted = compactionOf(scanned.memories);
    if (Option.isNone(range) && Option.isNone(compacted)) return false;

    const { model } = yield* sessionModel.run(events);

    yield* busyWhile(
      session,
      Option.isSome(range)
        ? writeRange(session, range.value, scanned.memories, model)
        : compact(
            session,
            Option.getOrElse(compacted, () => []),
            model,
          ),
    );

    return true;
  });

  const writeDue = (session: SessionId): Effect.Effect<void> =>
    writeNext(session).pipe(
      Effect.flatMap((wrote) => (wrote ? writeDue(session) : Effect.void)),
      Effect.catchCause((cause) => Effect.logWarning("A memory could not be written", cause)),
    );

  const start = (session: SessionId) =>
    Effect.asVoid(FiberMap.run(fibers, session, writeDue(session), { onlyIfMissing: true }));

  const settle = (session: SessionId) =>
    FiberMap.get(fibers, session).pipe(
      Effect.flatMap(Option.match({ onNone: () => Effect.void, onSome: Fiber.await })),
      Effect.andThen(writeDue(session)),
    );

  const writing = (session: SessionId) =>
    SubscriptionRef.changes(busy).pipe(
      Stream.map((now) => now.has(session)),
      Stream.changes,
    );

  return { start, settle, writing } satisfies Writer;
});
