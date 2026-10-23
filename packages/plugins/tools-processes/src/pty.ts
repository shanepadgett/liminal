/** A command in a pseudo-terminal: the one place that calls Bun. */
import { Deferred, Effect, Option, Schedule, Schema } from "effect";

/** The terminal's size, which `Screen` matches. */
export const COLUMNS = 120;

export const ROWS = 40;

/** How long the process group has to end after `SIGTERM` before `SIGKILL`. */
const STOP_GRACE = "3 seconds";

/** How long output may still come after the command exits, such as from a child it left. */
const DRAIN = "1 second";

const ENV = { TERM: "xterm-256color", PAGER: "cat", GIT_PAGER: "cat" };

export class PtyFailed extends Schema.TaggedError<PtyFailed, { readonly brand: unique symbol }>()(
  "PtyFailed",
  { message: Schema.String },
) {}

export interface Pty {
  readonly write: (data: string) => Effect.Effect<void>;
  /** The exit code once the command has exited; a signal gives 128 + its number. */
  readonly exitCode: Effect.Effect<Option.Option<number>>;
  /** Waits for the command to exit, and for its last output. */
  readonly exited: Effect.Effect<number>;
  /** Stops the command and everything it started, then waits for it to exit. */
  readonly stop: Effect.Effect<void>;
}

export interface PtyOptions {
  readonly cwd: string;
  readonly onData: (data: Uint8Array) => void;
}

/** Sends `name` to the process group the PTY made the command lead; false once it is gone. */
const signalGroup = (pid: number, name: NodeJS.Signals | 0) =>
  Effect.try(() => process.kill(-pid, name)).pipe(
    Effect.match({ onFailure: () => false, onSuccess: () => true }),
  );

/** `SIGTERM` to the group, then `SIGKILL` if any of it is left after the grace. */
const stopGroup = Effect.fn("stopGroup")(function* (pid: number) {
  if (!(yield* signalGroup(pid, "SIGTERM"))) return;

  const gone = yield* Effect.repeat(signalGroup(pid, 0), {
    until: (alive) => !alive,
    schedule: Schedule.spaced("100 millis"),
  }).pipe(Effect.timeoutOption(STOP_GRACE));

  if (Option.isNone(gone)) yield* signalGroup(pid, "SIGKILL");
});

const spawn = (command: string, options: PtyOptions, closed: PromiseWithResolvers<void>) =>
  Effect.try({
    try: () =>
      Bun.spawn(["bash", "-c", command], {
        cwd: options.cwd,
        env: { ...process.env, ...ENV },
        terminal: {
          cols: COLUMNS,
          rows: ROWS,
          data: (_terminal, data) => {
            options.onData(data);
          },
          exit: () => {
            closed.resolve();
          },
        },
      }),
    catch: (cause) => new PtyFailed({ message: String(cause) }),
  });

/** Starts `command` with `bash -c` in a PTY; closing the scope stops it. */
export const openPty = Effect.fn("openPty")(function* (command: string, options: PtyOptions) {
  // Resolves when the PTY reaches end of file: everything holding it has closed it.
  const closed = Promise.withResolvers<void>();

  const proc = yield* Effect.acquireRelease(spawn(command, options, closed), (spawned) =>
    stopGroup(spawned.pid).pipe(Effect.andThen(Effect.sync(() => spawned.terminal?.close()))),
  );

  const exit = yield* Deferred.make<number>();

  yield* Effect.forkScoped(
    Effect.promise(() => proc.exited).pipe(
      Effect.tap(() => Effect.promise(() => closed.promise).pipe(Effect.timeoutOption(DRAIN))),
      Effect.flatMap((code) => Deferred.succeed(exit, code)),
    ),
  );

  const pty: Pty = {
    write: (data) =>
      Effect.sync(() => {
        proc.terminal?.write(data);
      }),
    exitCode: Effect.flatMap(Deferred.isDone(exit), (done) =>
      done ? Effect.asSome(Deferred.await(exit)) : Effect.succeedNone,
    ),
    exited: Deferred.await(exit),
    stop: stopGroup(proc.pid).pipe(Effect.andThen(Deferred.await(exit))),
  };

  return pty;
});
