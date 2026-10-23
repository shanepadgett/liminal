/**
 * Runs one command line with a fresh `bash -c` and collects its output. The command leads its own
 * process group, so closing the scope, at the end or on an interrupt, stops it and everything it
 * started: `SIGTERM`, then `SIGKILL` if it lingers.
 */
import { Duration, Effect, Fiber, Option, Ref, Schedule, Stream } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";

import { appended, emptyOutput, lastLines, type Output, textOf } from "./output.ts";

/** How often the latest lines are shown while the command runs. */
const TAIL_EVERY = Duration.millis(200);

/** Lines the row shows while the command runs. */
const TAIL_LINES = 5;

/** How long output may keep coming after the command exits, such as from a child it left behind. */
const DRAIN = Duration.seconds(1);

/** Set so a command that would wait for a pager or a password finishes instead of hanging. */
const QUIET_ENV = { PAGER: "cat", GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0" };

export type Ending =
  | { readonly kind: "exited"; readonly code: number }
  | { readonly kind: "signalled" }
  | { readonly kind: "stopped"; readonly seconds: number };

export interface Ran {
  readonly output: string;
  readonly ending: Ending;
}

export interface RunOptions {
  readonly cwd: string;
  readonly seconds: number;
  /** Shows the latest lines while the command runs. */
  readonly onTail: (tail: ReadonlyArray<string>) => Effect.Effect<void>;
}

/** Shows the latest lines each time new output came since the last time. */
const showTail = (output: Ref.Ref<Output>, onTail: RunOptions["onTail"]) =>
  Effect.gen(function* () {
    const shown = yield* Ref.make<Output>(emptyOutput);

    const showNew = Effect.gen(function* () {
      const current = yield* Ref.get(output);
      if (current === (yield* Ref.get(shown))) return;

      yield* Ref.set(shown, current);
      yield* onTail(lastLines(current, TAIL_LINES));
    });

    return yield* Effect.repeat(showNew, Schedule.spaced(TAIL_EVERY));
  });

/** How the command ended, waiting at most `seconds`. A signal ends it with no exit code. */
const endingOf = (handle: ChildProcessSpawner.ChildProcessHandle, seconds: number) =>
  handle.exitCode.pipe(
    Effect.map((code): Ending => ({ kind: "exited", code })),
    Effect.orElseSucceed((): Ending => ({ kind: "signalled" })),
    Effect.timeoutOption(Duration.seconds(seconds)),
    Effect.map(Option.getOrElse((): Ending => ({ kind: "stopped", seconds }))),
  );

export const runCommand = Effect.fn("shell.run")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: string,
  options: RunOptions,
) {
  const output = yield* Ref.make<Output>(emptyOutput);

  const handle = yield* spawner.spawn(
    ChildProcess.make("bash", ["-c", command], {
      cwd: options.cwd,
      stdin: "ignore",
      env: QUIET_ENV,
      extendEnv: true,
      killSignal: "SIGTERM",
      forceKillAfter: Duration.seconds(3),
    }),
  );

  const reading = yield* Effect.forkScoped(
    handle.all.pipe(
      Stream.decodeText(),
      Stream.runForEach((text) => Ref.update(output, (kept) => appended(kept, text))),
      Effect.ignore,
    ),
  );

  yield* Effect.forkScoped(showTail(output, options.onTail));

  const ending = yield* endingOf(handle, options.seconds);
  if (ending.kind !== "stopped") yield* Effect.ignore(Effect.timeout(Fiber.join(reading), DRAIN));

  return { output: textOf(yield* Ref.get(output)), ending } satisfies Ran;
}, Effect.scoped);
