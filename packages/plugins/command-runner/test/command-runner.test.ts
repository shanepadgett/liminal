/** CommandRunner: output and exit code, the timeout, interruption, and a missing folder. */

import { expect } from "bun:test";

import { Duration, Effect, Fiber, FileSystem, Layer, Path } from "effect";
import { TestClock } from "effect/testing";

import { Directories } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import commandRunner from "../plugin.ts";
import { CommandFailed, CommandRunner } from "../src/contract.ts";

const runner = serverOf(commandRunner).pipe(Layer.provideMerge(testBaseServices));

const spec = (command: string, cwd: string) => ({ command, cwd, timeout: Duration.seconds(10) });

effectTest(
  "a command returns what it wrote and its exit code",
  Effect.gen(function* () {
    const { project } = yield* Directories;
    const commands = yield* CommandRunner;

    const result = yield* commands.run({
      ...spec("echo out; echo err >&2; echo $GREETING; pwd; exit 3", project),
      env: { GREETING: "hi" },
    });

    const fs = yield* FileSystem.FileSystem;
    const real = yield* fs.realPath(project);

    expect(result.end).toEqual({ type: "exited", code: 3 });
    expect(result.stdout).toBe(`out\nhi\n${real}\n`);
    expect(result.stderr).toBe("err\n");
  }),
  runner,
);

effectTest(
  "a command past its timeout stops, keeping its output so far",
  Effect.gen(function* () {
    const { project } = yield* Directories;
    const commands = yield* CommandRunner;

    const fiber = yield* Effect.forkChild(
      commands.run({ ...spec("echo started; sleep 30", project), timeout: Duration.seconds(5) }),
    );

    yield* Effect.promise(() => Bun.sleep(300));
    yield* TestClock.adjust(Duration.seconds(5));
    const result = yield* Fiber.join(fiber);

    expect(result).toEqual({ end: { type: "timed-out" }, stdout: "started\n", stderr: "" });
  }),
  runner,
);

effectTest(
  "interrupting a run stops the command",
  Effect.gen(function* () {
    const { project } = yield* Directories;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const commands = yield* CommandRunner;
    const marker = path.join(project, "marker");

    const fiber = yield* Effect.forkChild(commands.run(spec(`sleep 1; touch ${marker}`, project)));

    yield* Effect.promise(() => Bun.sleep(200));
    yield* Fiber.interrupt(fiber);
    yield* Effect.promise(() => Bun.sleep(1500));

    expect(yield* fs.exists(marker)).toBe(false);
  }),
  runner,
);

effectTest(
  "a missing folder fails the run",
  Effect.gen(function* () {
    const { project } = yield* Directories;
    const commands = yield* CommandRunner;

    const failed = yield* Effect.flip(commands.run(spec("true", `${project}/missing`)));

    expect(failed).toBeInstanceOf(CommandFailed);
  }),
  runner,
);
