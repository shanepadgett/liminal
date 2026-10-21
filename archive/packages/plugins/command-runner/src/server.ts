/** Command-runner's server: runs commands with `/bin/sh -c` and no jail. */

import { Effect, Layer, Option, Ref, Stream } from "effect";
import type { PlatformError } from "effect/PlatformError";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { type CommandEnd, CommandFailed, CommandRunner, type CommandSpec } from "./contract.ts";

/** Appends each decoded chunk of `stream` to `into`. */
const collect = (stream: Stream.Stream<Uint8Array, PlatformError>, into: Ref.Ref<string>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.runForEach((chunk) => Ref.update(into, (text) => text + chunk)),
  );

const make = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const run = Effect.fn("CommandRunner.run")(function* (spec: CommandSpec) {
    const stdout = yield* Ref.make("");
    const stderr = yield* Ref.make("");

    const handle = yield* spawner.spawn(
      ChildProcess.make("/bin/sh", ["-c", spec.command], {
        cwd: spec.cwd,
        env: spec.env ?? {},
        extendEnv: true,
      }),
    );

    const exited = Effect.all(
      [collect(handle.stdout, stdout), collect(handle.stderr, stderr), handle.exitCode],
      { concurrency: "unbounded" },
    );

    const ended = yield* Effect.timeoutOption(exited, spec.timeout);

    const end = Option.match(ended, {
      onNone: (): CommandEnd => ({ type: "timed-out" }),
      onSome: ([, , code]): CommandEnd => ({ type: "exited", code }),
    });

    return { end, stdout: yield* Ref.get(stdout), stderr: yield* Ref.get(stderr) };
  });

  return CommandRunner.of({
    run: (spec) =>
      run(spec).pipe(
        Effect.scoped,
        Effect.mapError((cause) => new CommandFailed({ message: cause.message, cause })),
      ),
  });
});

export const layer = Layer.effect(CommandRunner, make);
