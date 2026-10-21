/** Runs git in a reference's folder and gives its output, or git's line saying what failed. */

import { Duration, Effect, Option, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ReferenceFailed } from "../contract.ts";

/** How long a git command that stays on this machine may run. */
export const LOOKUP_TIMEOUT = Duration.seconds(10);

/** How long a git command that talks to the remote may run. */
export const NETWORK_TIMEOUT = Duration.minutes(5);

/** The line of git's output that says what failed: `fatal:` or `error:`, else the first line. */
export const errorLine = (output: string) => {
  const lines = output.split("\n").flatMap((line) => (line.trim() === "" ? [] : [line.trim()]));

  return lines.find((line) => /^(fatal|error):/.test(line)) ?? lines[0] ?? "git failed.";
};

/** Runs `git args` in `directory`; fails with git's error line when it exits with another code than 0. */
export const runGit = Effect.fn("references.git")(function* (
  reference: string,
  directory: string,
  args: ReadonlyArray<string>,
  timeout: Duration.Duration,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const failed = (message: string) => new ReferenceFailed({ reference, message });

  const finished = yield* Effect.scoped(
    Effect.gen(function* () {
      const child = yield* spawner.spawn(
        ChildProcess.make("git", args, { cwd: directory, stdin: "ignore", killSignal: "SIGKILL" }),
      );

      const output = yield* Stream.mkString(Stream.decodeText(child.all));

      return { exitCode: yield* child.exitCode, output };
    }),
  ).pipe(
    Effect.timeoutOption(timeout),
    Effect.mapError((cause) => failed(cause.message)),
  );

  if (Option.isNone(finished)) return yield* failed("git took too long.");
  if (finished.value.exitCode !== 0) return yield* failed(errorLine(finished.value.output));

  return finished.value.output;
});
