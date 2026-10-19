#!/usr/bin/env bun
/**
 * Liminal supervisor: runs the app as a child process and starts it again each time it exits with
 * {@link restartExitCode}. Any other exit code ends the supervisor with that code. Each run gets the
 * same handoff file, in a folder removed when the supervisor ends.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Exit, FileSystem, Path, Predicate, Runtime } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { handoffVariable } from "./handoff.ts";

/** The exit code the app uses to ask the supervisor for a fresh process. */
export const restartExitCode = 75;

/** Exits with the program's number result; any other end exits as the default teardown does. */
export const exitWithCode: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isSuccess(exit) && Predicate.isNumber(exit.value)) {
    onExit(exit.value);
  } else {
    Runtime.defaultTeardown(exit, onExit);
  }
};

/** Runs `command` until it exits with a code other than {@link restartExitCode}, then returns it. */
export const supervise = Effect.fn("supervise")(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  let code = yield* spawner.exitCode(command);

  while (code === restartExitCode) {
    code = yield* spawner.exitCode(command);
  }

  return code;
});

/**
 * Runs `program` on the supervisor's terminal. The child stays in the terminal's foreground process
 * group: a detached child never gets SIGWINCH, so the TUI would keep drawing at its starting size.
 */
export const onThisTerminal = (
  program: string,
  args: ReadonlyArray<string>,
  env: Record<string, string> = {},
) =>
  ChildProcess.make(program, args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    detached: false,
    env,
    extendEnv: true,
  });

const main = Effect.gen(function* () {
  const path = yield* Path.Path;
  const folder = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();

  return yield* supervise(
    onThisTerminal(
      process.execPath,
      [path.join(import.meta.dir, "main.ts"), ...process.argv.slice(2)],
      { [handoffVariable]: path.join(folder, "handoff.json") },
    ),
  );
}).pipe(Effect.scoped);

if (import.meta.main) {
  BunRuntime.runMain(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the supervisor's entry point.
    main.pipe(Effect.provide(BunServices.layer)),
    { teardown: exitWithCode },
  );
}
