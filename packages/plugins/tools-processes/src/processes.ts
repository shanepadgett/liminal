/** Each session's processes: started in a PTY, read through a screen, stopped with their scope. */
import { Clock, Duration, Effect, Exit, Option, Ref, Schedule, Scope } from "effect";

import type { SessionId } from "@shanepadgett/liminal-session/contract";
import { ToolFailed } from "@shanepadgett/liminal-tools/contract";

import { openPty, type Pty } from "./pty.ts";
import { makeScreen, type Screen } from "./screen.ts";

/** How long output must stay quiet, after new output, before a call returns. */
const QUIET_MILLIS = 1000;

export interface Running {
  readonly id: string;
  readonly session: SessionId;
  readonly pty: Pty;
  readonly screen: Screen;
  readonly scope: Scope.Closeable;
}

export interface Processes {
  readonly start: (session: SessionId, command: string) => Effect.Effect<Running, ToolFailed>;
  readonly find: (session: SessionId, id: string) => Effect.Effect<Running, ToolFailed>;
  /** Waits up to `seconds` for output to settle, then returns what is new and the state line. */
  readonly settle: (running: Running, seconds: number) => Effect.Effect<string>;
  /** Stops the process and everything it started, and returns its last output. */
  readonly stop: (running: Running) => Effect.Effect<string>;
}

const keyOf = (session: SessionId, id: string) => `${session}/${id}`;

/** True once new output has come and then none for a second. */
const isQuiet = (screen: Screen) =>
  Effect.gen(function* () {
    const unread = yield* screen.unread;
    const now = yield* Clock.currentTimeMillis;

    return Option.exists(unread, (at) => now - at >= QUIET_MILLIS);
  });

const waitFor = (running: Running, seconds: number) =>
  Effect.raceFirst(
    Effect.asVoid(running.pty.exited),
    Effect.repeat(isQuiet(running.screen), {
      until: (quiet) => quiet,
      schedule: Schedule.spaced("100 millis"),
    }),
  ).pipe(Effect.timeoutOption(Duration.seconds(seconds)));

/** What is new, then where the process stands. */
const report = Effect.fn("report")(function* (running: Running) {
  const lines = yield* running.screen.readNew;
  const code = yield* running.pty.exitCode;

  const state = Option.match(code, {
    onNone: () => `[${running.id} running]`,
    onSome: (exit) => `[${running.id} exited with code ${exit}]`,
  });

  return [...lines, state].join("\n");
});

/** Opens `command` in `scope`: a screen, and a PTY that writes to it. */
const openIn = Effect.fn("openIn")(function* (
  scope: Scope.Closeable,
  cwd: string,
  command: string,
) {
  const opened = Effect.gen(function* () {
    const screen = yield* makeScreen;
    const pty = yield* openPty(command, { cwd, onData: screen.write });

    return { pty, screen };
  });

  return yield* Scope.provide(scope)(opened).pipe(
    Effect.onError(() => Scope.close(scope, Exit.void)),
    Effect.mapError(
      (error) => new ToolFailed({ message: `bash could not start: ${error.message}` }),
    ),
  );
});

/** Processes live in scopes forked from `parent`, so closing it stops them all. */
export const makeProcesses = Effect.fn("makeProcesses")(function* (
  parent: Scope.Scope,
  cwd: string,
) {
  const counts = yield* Ref.make<ReadonlyMap<SessionId, number>>(new Map());
  const byKey = yield* Ref.make<ReadonlyMap<string, Running>>(new Map());

  const nextId = (session: SessionId) =>
    Ref.modify(counts, (current) => {
      const count = (current.get(session) ?? 0) + 1;

      return [`p${count}`, new Map([...current, [session, count]])];
    });

  const processes: Processes = {
    start: Effect.fn("start")(function* (session, command) {
      const scope = yield* Scope.fork(parent);
      const id = yield* nextId(session);
      const { pty, screen } = yield* openIn(scope, cwd, command);
      const started: Running = { id, session, pty, screen, scope };

      yield* Ref.update(
        byKey,
        (current) => new Map([...current, [keyOf(session, started.id), started]]),
      );

      return started;
    }),
    find: (session, id) =>
      Effect.flatMap(Ref.get(byKey), (current) =>
        Effect.fromOption(Option.fromNullishOr(current.get(keyOf(session, id)))),
      ).pipe(
        Effect.mapError(
          () =>
            new ToolFailed({
              message: `No process ${id} in this session. Processes stop when Liminal exits.`,
            }),
        ),
      ),
    settle: (running, seconds) =>
      Effect.andThen(seconds > 0 ? waitFor(running, seconds) : Effect.void, report(running)),
    stop: Effect.fn("stop")(function* (running) {
      yield* running.pty.stop;
      const text = yield* report(running);
      yield* Scope.close(running.scope, Exit.void);

      yield* Ref.update(
        byKey,
        (current) =>
          new Map([...current].filter(([key]) => key !== keyOf(running.session, running.id))),
      );

      return text;
    }),
  };

  return processes;
});
