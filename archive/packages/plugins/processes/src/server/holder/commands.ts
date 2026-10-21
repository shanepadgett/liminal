/**
 * The holder's commands, kept per session: each one's output, state and whether its exit was
 * reported. Closing the scope that made them stops every command.
 */

import {
  Clock,
  Duration,
  Effect,
  Fiber,
  HashMap,
  Option,
  Predicate,
  PubSub,
  Ref,
  Scope,
  Stream,
} from "effect";

import {
  Exited,
  type ProcessExit,
  ProcessNotRunning,
  type ProcessState,
  type ProcessSummary,
  Running,
  Stopped,
  UnknownProcess,
  type WaitReason,
  type WaitResult,
} from "../../contract.ts";
import { makeOutputBuffer, type OutputBuffer } from "./buffer.ts";
import { spawnCommand, type Transport } from "./spawn.ts";

/** Characters kept per command: the first half and the last half of its output. */
const BUFFER_CHARACTERS = 1_048_576;
/** Lines a wait with no new output, an exit and the live view show. */
export const TAIL_LINES = 12;
/** How long output may still arrive after a command exits. */
const DRAIN = Duration.millis(200);
/** What a command's changes carry; only their arrival matters. */
const CHANGED = "changed";

interface Live {
  readonly id: string;
  readonly command: string;
  readonly pty: boolean;
  readonly transport: Transport;
  readonly buffer: OutputBuffer;
  readonly state: Ref.Ref<ProcessState>;
  /** Published when output arrives and when the state changes. */
  readonly changes: PubSub.PubSub<typeof CHANGED>;
  readonly reported: Ref.Ref<boolean>;
}

export interface StartRequest {
  readonly session: string;
  readonly command: string;
  readonly cwd: string;
  readonly pty: boolean;
  readonly waitSeconds: number;
}

/** When a wait ends: a matching line, quiet for a while, or a deadline. */
export interface WaitConditions {
  readonly pattern: Option.Option<RegExp>;
  readonly quiet: Duration.Duration;
  readonly deadline: Duration.Duration;
}

const isRunning = (state: ProcessState) => Predicate.isTagged(state, "Running");

const summaryOf = (live: Live) =>
  Ref.get(live.state).pipe(
    Effect.map((state): ProcessSummary => ({
      id: live.id,
      command: live.command,
      pty: live.pty,
      state,
    })),
  );

/** Output goes into the buffer; once it drains after the exit, the state settles. */
const watch = Effect.fn("processes.watch")(function* (live: Live, states: Effect.Effect<void>) {
  const reading = yield* live.transport.output.pipe(
    Stream.runForEach((text) =>
      Effect.sync(() => {
        live.buffer.append(text);
      }).pipe(Effect.andThen(PubSub.publish(live.changes, CHANGED))),
    ),
    Effect.forkChild,
  );

  const code = yield* live.transport.exitCode;
  yield* Fiber.join(reading).pipe(Effect.timeoutOption(DRAIN));
  yield* live.transport.stop;

  yield* Ref.update(live.state, (state): ProcessState =>
    isRunning(state) ? Exited.make({ code }) : state,
  );

  yield* PubSub.publish(live.changes, CHANGED);
  yield* states;
});

const ended = Effect.fn("processes.ended")(function* (live: Live, state: ProcessState) {
  yield* Ref.set(live.reported, true);
  const reason: WaitReason = Predicate.isTagged(state, "Exited") ? "exited" : "stopped";
  const process = yield* summaryOf(live);

  return { reason, process, output: live.buffer.takeUnread() } satisfies WaitResult;
});

const paused = Effect.fn("processes.paused")(function* (live: Live, reason: WaitReason) {
  const output = live.buffer.takeUnread();
  const process = yield* summaryOf(live);
  const waited: WaitResult = { reason, process, output };

  return output === "" ? { ...waited, tail: live.buffer.lastLines(TAIL_LINES) } : waited;
});

/** Whether a whole line since `from` matches, and where the unfinished last line starts. */
const scan = (buffer: OutputBuffer, from: number, pattern: Option.Option<RegExp>) => {
  const text = buffer.textFrom(from);
  const unfinished = text.length - (text.lastIndexOf("\n") + 1);
  const lines = text.slice(0, text.length - unfinished).split(/\r?\n/);

  return {
    matched: Option.exists(pattern, (regex) => lines.some((line) => regex.test(line))),
    scannedTo: buffer.length() - unfinished,
  };
};

/** Returns when the command ends, a line matches, output goes quiet, or the deadline passes. */
export const waitFor = Effect.fn("processes.waitFor")(function* (live: Live, when: WaitConditions) {
  const changes = yield* PubSub.subscribe(live.changes);
  const begin = yield* Clock.currentTimeMillis;
  const deadlineAt = begin + Duration.toMillis(when.deadline);
  const quietMillis = Duration.toMillis(when.quiet);
  let quietAt = begin + quietMillis;
  let scanned = live.buffer.readMark();

  for (;;) {
    const state = yield* Ref.get(live.state);
    if (!isRunning(state)) return yield* ended(live, state);

    const found = scan(live.buffer, scanned, when.pattern);
    scanned = found.scannedTo;
    if (found.matched) return yield* paused(live, "matched");

    const now = yield* Clock.currentTimeMillis;
    const wakeAt = Math.min(quietAt, deadlineAt);
    if (now >= wakeAt) return yield* paused(live, now >= deadlineAt ? "deadline" : "quiet");

    const arrived = yield* PubSub.take(changes).pipe(
      Effect.timeoutOption(Duration.millis(wakeAt - now)),
    );

    if (Option.isSome(arrived)) quietAt = (yield* Clock.currentTimeMillis) + quietMillis;
  }
}, Effect.scoped);

export const exitOf = Effect.fn("processes.exitOf")(function* (live: Live) {
  const process = yield* summaryOf(live);
  if (!Predicate.isTagged(process.state, "Exited") || (yield* Ref.get(live.reported))) return [];

  yield* Ref.set(live.reported, true);

  return [{ process, tail: live.buffer.lastLines(TAIL_LINES) } satisfies ProcessExit];
});

const stopAll = (lives: ReadonlyArray<Live>) =>
  Effect.forEach(lives, (live) => live.transport.stop, { concurrency: "unbounded", discard: true });

const lookup = (lives: ReadonlyArray<Live>, id: string) =>
  Effect.fromOption(Option.fromUndefinedOr(lives.find((live) => live.id === id))).pipe(
    Effect.mapError(() => new UnknownProcess({ id })),
  );

/** Makes the registry; closing its scope stops every command. */
export const makeCommands = Effect.gen(function* () {
  const scope = yield* Scope.Scope;
  const sessions = yield* Ref.make(HashMap.empty<string, ReadonlyArray<Live>>());
  /** A session's id each time one of its commands starts or changes state. */
  const states = yield* PubSub.unbounded<string>();

  const changed = (session: string) => PubSub.publish(states, session).pipe(Effect.asVoid);

  const all = Effect.map(Ref.get(sessions), (map) => [...HashMap.values(map)].flat());

  yield* Effect.addFinalizer(() => Effect.flatMap(all, stopAll));

  const of = (session: string) =>
    Effect.map(Ref.get(sessions), (map) => Option.getOrElse(HashMap.get(map, session), () => []));

  const find = (session: string, id: string) =>
    Effect.flatMap(of(session), (lives) => lookup(lives, id));

  const list = (session: string) => Effect.flatMap(of(session), Effect.forEach(summaryOf));

  const start = Effect.fn("processes.start")(function* (request: StartRequest) {
    const transport = yield* spawnCommand(request);

    const live: Live = {
      id: `p${(yield* of(request.session)).length + 1}`,
      command: request.command,
      pty: request.pty,
      transport,
      buffer: makeOutputBuffer(BUFFER_CHARACTERS),
      state: yield* Ref.make<ProcessState>(Running.make({})),
      changes: yield* PubSub.sliding<typeof CHANGED>(1),
      reported: yield* Ref.make(false),
    };

    yield* Ref.update(sessions, (map) =>
      HashMap.modifyAt(map, request.session, (lives) =>
        Option.some([...Option.getOrElse(lives, () => []), live]),
      ),
    );

    yield* Effect.forkIn(watch(live, changed(request.session)), scope);
    yield* changed(request.session);

    return yield* waitFor(live, {
      pattern: Option.none(),
      quiet: Duration.infinity,
      deadline: Duration.seconds(request.waitSeconds),
    });
  });

  const stop = Effect.fn("processes.stop")(function* (session: string, live: Live) {
    yield* Ref.update(live.state, (state): ProcessState =>
      isRunning(state) ? Stopped.make({}) : state,
    );

    yield* live.transport.stop;
    yield* PubSub.publish(live.changes, CHANGED);
    yield* changed(session);

    return yield* summaryOf(live);
  });

  /** How many commands still run. */
  const running = Effect.flatMap(
    all,
    Effect.forEach((live) => Ref.get(live.state)),
  ).pipe(Effect.map((each) => each.filter(isRunning).length));

  return { all, running, lives: of, list, find, start, stop, states } as const;
});

export type Commands = Effect.Success<typeof makeCommands>;

export const readLive = Effect.fn("processes.read")(function* (live: Live) {
  const output = live.buffer.takeUnread();
  const process = yield* summaryOf(live);
  if (!isRunning(process.state)) yield* Ref.set(live.reported, true);

  return { process, output };
});

/** Types into a running command. */
export const writeLive = (live: Live, text: string) =>
  Effect.flatMap(Ref.get(live.state), (state) =>
    isRunning(state)
      ? live.transport.write(text)
      : Effect.fail(new ProcessNotRunning({ id: live.id })),
  );

/** The command's last lines now, then after each change, until it ends. */
export const tailOf = (live: Live) =>
  Stream.succeed(CHANGED).pipe(
    Stream.concat(Stream.fromPubSub(live.changes).pipe(Stream.debounce(Duration.millis(100)))),
    Stream.mapEffect(() => Ref.get(live.state)),
    Stream.takeUntil((state) => !isRunning(state)),
    Stream.map(() => live.buffer.lastLines(TAIL_LINES)),
    Stream.changes,
  );

export type { Live };
