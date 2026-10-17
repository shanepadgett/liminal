/** Shell tool's server: registers `shell`, which runs through the CommandRunner in the workspace. */

import { Duration, Effect, Layer, Path } from "effect";

import { type CommandResult, CommandRunner } from "@liminal/command-runner/contract";
import { defineTool, Directories, ToolFailed } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

import { ShellParams } from "./contract.ts";

/** Seconds a command runs when the model sets no timeout. */
const defaultTimeout = 120;

/** What the model reads: stdout, then stderr, then how the command ended. */
const report = (result: CommandResult, timeout: number) => {
  const ending =
    result.end.type === "exited"
      ? `[exit code ${result.end.code}]`
      : `[stopped after ${timeout} seconds]`;

  const stdout = result.stdout.trimEnd();
  const stderr = result.stderr.trimEnd();

  return [stdout, stderr === "" ? "" : `[stderr]\n${stderr}`, ending]
    .filter((part) => part !== "")
    .join("\n");
};

const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const tools = yield* Tools;
  const runner = yield* CommandRunner;
  const workspace = path.dirname((yield* Directories).project);

  yield* tools.register(
    defineTool({
      name: "shell",
      description: "Runs a command line with /bin/sh in the workspace and returns its output.",
      parameters: ShellParams,
      runAlongside: false,
      safeToRerun: false,
      run: ({ command, timeout = defaultTimeout }) =>
        runner.run({ command, cwd: workspace, timeout: Duration.seconds(timeout) }).pipe(
          Effect.mapError((error) => new ToolFailed({ message: error.message })),
          Effect.map((result) => ({ result: report(result, timeout), details: result.end })),
        ),
    }),
  );
});

export const layer = Layer.effectDiscard(make);
