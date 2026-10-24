/**
 * Memory: long sessions that keep going past the context window. The small model writes memories of
 * the oldest work as it goes; a checkpoint starts the model's context over from those memories, the
 * recent work and a note. The model checkpoints with the `checkpoint` tool when nudged, and memory
 * checkpoints by itself when the cache is lost, the model changes or the context overflows.
 */
import { Clock, DateTime, Duration, Effect, FileSystem, Option, Path, Stream } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Converters, defineConverter, History } from "@shanepadgett/liminal-history/contract";
import {
  BeforeCall,
  CallFailed,
  SessionModel,
  type Turn,
  TurnEnd,
} from "@shanepadgett/liminal-loop/contract";
import {
  isContextOverflow,
  type Message,
  type ModelId,
  Models,
  type ToolResult,
} from "@shanepadgett/liminal-model/contract";
import {
  type EventInvalid,
  type LiveItem,
  type SessionEvent,
  type SessionId,
  SessionLog,
} from "@shanepadgett/liminal-session/contract";
import { SystemPrompt } from "@shanepadgett/liminal-system-prompt/contract";
import { ToolList } from "@shanepadgett/liminal-tool-definitions/contract";
import { ToolCall, type ToolCallRequest, Tools } from "@shanepadgett/liminal-tools/contract";

import { type Checkpoint, makeCheckpoint } from "./checkpoint.ts";
import {
  CheckpointMade,
  checkpointName,
  MemoryRpc,
  MemoryWritten,
  Nudge,
  type NudgeLevel,
  type Trigger,
} from "./contract.ts";
import { makeReadBack } from "./files.ts";
import { considerAt, isAbove, type Limits, levelOf, limitsOf, sizeOf } from "./measure.ts";
import { type Scan, scan } from "./scan.ts";
import { makeCheckpointTool } from "./tool.ts";
import { makeWriter, rangeOf, type Writer } from "./writer.ts";

const NUDGES: Readonly<Record<NudgeLevel, string>> = {
  consider:
    "The context is getting large. At the next natural break, such as after finishing a piece of work, call checkpoint.",
  soon: "The context is large. Call checkpoint soon, once the current piece of work is done.",
  full: "The context is full. Call checkpoint now, alone; other tool calls are refused until you do.",
};

const reminder = (level: NudgeLevel): ReadonlyArray<Message> => [
  {
    role: "user",
    parts: [{ type: "text", text: `<system-reminder>${NUDGES[level]}</system-reminder>` }],
  },
];

/** What the session's next call runs on; none when its model cannot be found. */
interface NextModel {
  readonly model: ModelId;
  readonly window: number | undefined;
  readonly lifetime: Duration.Duration;
}

interface Services {
  readonly log: SessionLog["Service"];
  readonly models: Models["Service"];
  readonly sessionModel: SessionModel["Service"];
  readonly writer: Writer;
  readonly checkpoint: Checkpoint;
}

const nextModelOf = (services: Services, events: ReadonlyArray<SessionEvent>) =>
  Effect.gen(function* () {
    const { model } = yield* services.sessionModel.run(events);
    const details = yield* services.models.details(model);
    const lifetime = yield* services.models.cacheLifetime(model);

    return { model, window: Option.getOrUndefined(details)?.contextWindow, lifetime };
  }).pipe(Effect.option);

/** Whether the latest step is older than the cache lasts, or ran on another model. */
const staleOf = (scanned: Scan, next: NextModel, now: number): Option.Option<Trigger> =>
  Option.flatMap(scanned.lastStep, (step) => {
    if (step.model !== next.model) return Option.some<Trigger>("model-switch");

    const idle = now - DateTime.toEpochMillis(step.at) > Duration.toMillis(next.lifetime);

    return idle ? Option.some<Trigger>("idle") : Option.none();
  });

/** The checkpoint the next call needs before it runs, if any. */
const triggerOf = (scanned: Scan, limits: Limits, next: NextModel, now: number) => {
  const size = sizeOf(scanned);

  if (next.window !== undefined && size > next.window) return Option.some<Trigger>("overflow");
  if (size <= considerAt(limits)) return Option.none<Trigger>();

  return staleOf(scanned, next, now);
};

/** Logs a nudge when the context passes a level above the latest one. */
const nudge = (
  log: SessionLog["Service"],
  session: SessionId,
  scanned: Scan,
  level: Option.Option<NudgeLevel>,
) =>
  Option.match(level, {
    onNone: () => Effect.void,
    onSome: (passed) =>
      isAbove(passed, scanned.nudge)
        ? Effect.asVoid(
            Effect.flatMap(Nudge.make({ level: passed }), (event) => log.append(session, [event])),
          )
        : Effect.void,
  });

const makeBeforeCall = (services: Services) =>
  Effect.fn("Memory.beforeCall")(function* ({ session }: Turn) {
    const { log, writer, checkpoint } = services;
    const events = yield* log.read(session);
    const scanned = scan(events);
    const next = yield* nextModelOf(services, events);
    const size = sizeOf(scanned);
    const limits = limitsOf(Option.getOrUndefined(next)?.window);
    const now = yield* Clock.currentTimeMillis;
    const trigger = Option.flatMap(next, (model) => triggerOf(scanned, limits, model, now));

    if (Option.isSome(trigger)) {
      yield* checkpoint(session, trigger.value, []);

      return;
    }

    yield* nudge(log, session, scanned, levelOf(size, limits));
    if (Option.isSome(rangeOf(scanned.uncovered))) yield* writer.start(session);
  });

/** Starts the writer when a range is due, so it writes while the user reads. */
const startIfDue =
  (services: Services) =>
  ({ session }: Turn) =>
    Effect.flatMap(services.log.read(session), (events) =>
      Option.isSome(rangeOf(scan(events).uncovered)) ? services.writer.start(session) : Effect.void,
    );

const denied = ({ call }: ToolCallRequest): ToolResult => ({
  type: "tool-result",
  callId: call.id,
  name: call.name,
  content: [{ type: "text", text: `${NUDGES.full} Call ${checkpointName} first.` }],
  isFailure: true,
});

/** Whether the latest nudge since the latest checkpoint says the context is full. */
const isFull = (log: SessionLog["Service"], session: SessionId) =>
  log.read(session).pipe(
    Effect.map((events) => Option.exists(scan(events).nudge, (level) => level === "full")),
    Effect.catch((error) =>
      Effect.as(Effect.logError("Memory could not read the log for a call", error), false),
    ),
  );

const memoriesMessage = (texts: ReadonlyArray<string>): ReadonlyArray<Message> =>
  texts.length === 0
    ? []
    : [
        {
          role: "user",
          parts: [
            {
              type: "text",
              text: `<memories>\nYour memories of this session so far, oldest first; the work since follows.\n\n${texts.map((text) => `<memory>\n${text}\n</memory>`).join("\n\n")}\n</memories>`,
            },
          ],
        },
      ];

/** After a checkpoint: its memories, then the entries from its `from` on, earlier nudges left out. */
const project = (
  events: ReadonlyArray<SessionEvent>,
  next: (
    events: ReadonlyArray<SessionEvent>,
  ) => Effect.Effect<ReadonlyArray<Message>, EventInvalid>,
) => {
  const latest = events.findLast((event) => event.kind === CheckpointMade.kind);

  const made = Option.flatMap(Option.fromNullishOr(latest), (event) =>
    Option.map(CheckpointMade.decodeOption(event), (data) => ({ seq: event.seq, data })),
  );

  if (Option.isNone(made)) return next(events);

  const { seq, data } = made.value;

  const texts = new Map(
    events.flatMap((event) =>
      Option.match(MemoryWritten.decodeOption(event), {
        onNone: () => [],
        onSome: ({ text }) => [[event.seq, text] as const],
      }),
    ),
  );

  const kept = events.filter(
    (event) => event.seq >= data.from && (event.kind !== Nudge.kind || event.seq > seq),
  );

  return Effect.map(next(kept), (messages) => [
    ...memoriesMessage(data.memories.flatMap((memory) => texts.get(memory) ?? [])),
    ...messages,
  ]);
};

const MEMORY_KINDS: ReadonlySet<string> = new Set([MemoryWritten.kind, CheckpointMade.kind]);

const isMemoryEvent = (item: LiveItem): item is SessionEvent =>
  "seq" in item && MEMORY_KINDS.has(item.kind);

const countsOf = (events: ReadonlyArray<SessionEvent>) => {
  const scanned = scan(events);

  return { memories: scanned.memories.length, checkpoints: scanned.checkpoints };
};

/** The session's memory and checkpoint counts, then again after each memory event. */
const countsStream = (log: SessionLog["Service"], session: SessionId) =>
  Stream.unwrap(
    Effect.map(log.read(session), (saved) =>
      Stream.concat(
        Stream.make(countsOf(saved)),
        log.live(session, saved.at(-1)?.seq).pipe(
          Stream.filter(isMemoryEvent),
          Stream.mapEffect(() => Effect.map(log.read(session), countsOf)),
        ),
      ),
    ),
  );

const register = Effect.gen(function* () {
  const log = yield* SessionLog;
  const models = yield* Models;
  const sessionModel = yield* SessionModel;
  const history = yield* History;
  const writer = yield* makeWriter({ log, models, history, sessionModel });

  const checkpoint = makeCheckpoint({
    log,
    writer,
    systemPrompt: yield* SystemPrompt,
    toolList: yield* ToolList,
  });

  const services: Services = { log, models, sessionModel, writer, checkpoint };

  yield* (yield* Tools).add(makeCheckpointTool(log, checkpoint, yield* makeReadBack));
  yield* (yield* BeforeCall).add(makeBeforeCall(services));
  yield* (yield* TurnEnd).add(startIfDue(services));

  yield* (yield* CallFailed).add((turn, error) =>
    isContextOverflow(error)
      ? Effect.as(checkpoint(turn.session, "overflow", []), true)
      : Effect.succeed(false),
  );

  yield* (yield* Converters).add(defineConverter(Nudge, ({ level }) => reminder(level)));
  yield* history.wrap(project);

  yield* (yield* ToolCall).wrap((request, next) =>
    request.call.name === checkpointName
      ? next(request)
      : Effect.flatMap(isFull(log, request.session), (full) =>
          full ? Effect.succeed(denied(request)) : next(request),
        ),
  );

  return MemoryRpc.of({
    "memory/status": ({ session }) =>
      Stream.zipLatestWith(
        countsStream(log, session),
        writer.writing(session),
        (counts, writing) => ({ ...counts, writing }),
      ),
  });
});

export default definePlugin({
  name: "memory",
  provides: [],
  requires: [
    SessionLog,
    Models,
    SessionModel,
    History,
    Converters,
    SystemPrompt,
    ToolList,
    Tools,
    ToolCall,
    BeforeCall,
    TurnEnd,
    CallFailed,
    Directories,
    FileSystem.FileSystem,
    Path.Path,
  ],
  layer: MemoryRpc.toLayer(register),
  entries: { tui: () => import("./tui/index.tsx") },
});
