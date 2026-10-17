#!/usr/bin/env bun
/**
 * Liminal supervisor: runs the app as a child process and starts it again each time it exits with
 * {@link restartExitCode}. Any other exit code ends the supervisor with that code.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Exit, Path, Predicate, Runtime } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

/** The exit code the app uses to ask the supervisor for a fresh process. */
export const restartExitCode = 75;

/** Runs `command` until it exits with a code other than {@link restartExitCode}, then returns it. */
export const supervise = Effect.fn("supervise")(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  let code = yield* spawner.exitCode(command);

  while (code === restartExitCode) {
    code = yield* spawner.exitCode(command);
  }

  return code;
});

const main = Effect.gen(function* () {
  const path = yield* Path.Path;

  return yield* supervise(
    ChildProcess.make(
      process.execPath,
      [path.join(import.meta.dir, "main.ts"), ...process.argv.slice(2)],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    ),
  );
});

if (import.meta.main) {
  BunRuntime.runMain(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the supervisor's entry point.
    main.pipe(Effect.provide(BunServices.layer)),
    {
      teardown: (exit, onExit) => {
        if (Exit.isSuccess(exit) && Predicate.isNumber(exit.value)) {
          onExit(exit.value);
        } else {
          Runtime.defaultTeardown(exit, onExit);
        }
      },
    },
  );
}
