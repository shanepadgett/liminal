/**
 * Starts a command line with `/bin/sh -c`, on pipes or on a pseudo-terminal, as the leader of its
 * own process group. Stopping it signals everything it started, then the command.
 */

import { type Cause, Duration, Effect, Queue, Stream } from "effect";

import { ProcessStartFailed } from "../../contract.ts";

const COLUMNS = 120;
const ROWS = 40;
const DESCENDANTS_GRACE = Duration.millis(200);
const ROOT_GRACE = Duration.millis(500);

/** What the registry needs from a running command. */
export interface Transport {
  /** Output as text, stdout and stderr together; it ends when the command closes them. */
  readonly output: Stream.Stream<string>;
  readonly write: (text: string) => Effect.Effect<void>;
  readonly exitCode: Effect.Effect<number>;
  /** Stops the command and all it started, and frees its terminal; again does nothing. */
  readonly stop: Effect.Effect<void>;
}

export interface ShellStart {
  readonly command: string;
  readonly cwd: string;
  readonly pty: boolean;
}

/** Sends a signal to a process that may already be gone. */
const signal = (pid: number, name: NodeJS.Signals) => {
  try {
    process.kill(pid, name);
  } catch {
    // A process that cannot be signaled is gone or not ours; nothing is left to stop.
  }
};

/** Every process's id and parent's id, read with `ps`; none when `ps` fails. */
const processTable = Effect.tryPromise(async () => {
  const ps = Bun.spawn(["/bin/ps", "-axo", "pid=,ppid="], { stdout: "pipe", stderr: "ignore" });

  return (await new Response(ps.stdout).text())
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
}).pipe(Effect.orElseSucceed((): ReadonlyArray<ReadonlyArray<number>> => []));

/** The processes below `root`, children before their parents. */
const descendantsOf = (root: number, table: ReadonlyArray<ReadonlyArray<number>>) => {
  const found = [root];

  for (const pid of found) {
    for (const [child, parent] of table) {
      if (parent === pid && child !== undefined && !found.includes(child)) found.push(child);
    }
  }

  return found.slice(1).toReversed();
};

const stopTree = Effect.fn("processes.stopTree")(function* (
  pid: number,
  exited: Effect.Effect<number>,
) {
  const descendants = descendantsOf(pid, yield* processTable);

  for (const each of descendants) signal(each, "SIGTERM");
  if (descendants.length > 0) yield* Effect.sleep(DESCENDANTS_GRACE);
  for (const each of descendants) signal(each, "SIGKILL");

  signal(-pid, "SIGTERM");
  yield* exited.pipe(Effect.timeoutOption(ROOT_GRACE));
  signal(-pid, "SIGKILL");
  signal(pid, "SIGKILL");
  yield* exited;
});

const isRunning = (child: Bun.Subprocess) => child.exitCode === null && child.signalCode === null;

const decoder = () => {
  const text = new TextDecoder();

  return (bytes: Uint8Array) => text.decode(bytes, { stream: true });
};

/** A pipe's bytes as text; a pipe that breaks just ends. */
const read = (stream: ReadableStream<Uint8Array>) =>
  Stream.fromReadableStream({ evaluate: () => stream, onError: () => "closed" }).pipe(
    Stream.map(decoder()),
    Stream.orElseSucceed(() => ""),
  );

const onPipes = (shell: ShellStart) =>
  Effect.try({
    try: () =>
      Bun.spawn(["/bin/sh", "-c", shell.command], {
        cwd: shell.cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
      }),
    catch: (cause) => new ProcessStartFailed({ command: shell.command, reason: String(cause) }),
  }).pipe(
    Effect.map((child): Transport => {
      const exitCode = Effect.promise(() => child.exited);

      return {
        output: Stream.merge(read(child.stdout), read(child.stderr)),
        write: (text) =>
          Effect.sync(() => {
            void child.stdin.write(text);
            void child.stdin.flush();
          }),
        exitCode,
        stop: Effect.suspend(() =>
          isRunning(child) ? stopTree(child.pid, exitCode) : Effect.void,
        ),
      };
    }),
  );

const onTerminal = Effect.fn("processes.onTerminal")(function* (shell: ShellStart) {
  const output = yield* Queue.unbounded<string, Cause.Done>();
  const decode = decoder();

  const terminal = new Bun.Terminal({
    cols: COLUMNS,
    rows: ROWS,
    data: (_terminal, bytes) => {
      Queue.offerUnsafe(output, decode(bytes));
    },
    exit: () => {
      Queue.endUnsafe(output);
    },
  });

  const child = yield* Effect.try({
    try: () =>
      Bun.spawn(["/bin/sh", "-c", shell.command], { cwd: shell.cwd, terminal, detached: true }),
    catch: (cause) => new ProcessStartFailed({ command: shell.command, reason: String(cause) }),
  }).pipe(
    Effect.onError(() =>
      Effect.sync(() => {
        terminal.close();
      }),
    ),
  );

  const exitCode = Effect.promise(() => child.exited);

  const transport: Transport = {
    output: Stream.fromQueue(output),
    write: (text) => Effect.sync(() => terminal.write(text)),
    exitCode,
    stop: Effect.suspend(() =>
      isRunning(child) ? stopTree(child.pid, exitCode) : Effect.void,
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          terminal.close();
        }),
      ),
    ),
  };

  return transport;
});

/** Starts `shell.command` in `shell.cwd`. */
export const spawnCommand = (shell: ShellStart): Effect.Effect<Transport, ProcessStartFailed> =>
  shell.pty ? onTerminal(shell) : onPipes(shell);
