/** Shell tool's server: registers `shell`, which runs through the CommandRunner in the workspace. */

import { Duration, Effect, Layer } from "effect";

import { type CommandResult, CommandRunner } from "@liminal/command-runner/contract";
import { defineTool, Directories, ToolFailed } from "@liminal/sdk";
import { Tools } from "@liminal/tools/contract";

import { ShellParams } from "./contract.ts";
import { detectGuidance } from "./server/guidance.ts";

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
  const tools = yield* Tools;
  const runner = yield* CommandRunner;
  const { workspace } = yield* Directories;
  const helperGuidance = yield* detectGuidance();

  yield* tools.register(
    defineTool({
      name: "shell",
      description: `Runs a command line with /bin/sh in ${workspace} and returns its output. Every command starts in ${workspace} in a fresh shell, so do not cd into it; a cd does not carry over to the next call.`,
      parameters: ShellParams,
      guidance: [
        "Use `shell` to run programs, builds and tests that finish; use a file tool to read or change a file when one fits. For a command that keeps running or needs input, load `process_start` with `tool_search`.",
        "Prefer targeted, noninteractive shell commands with plain output. Disable pagers and color where supported. Follow repository-specific commands and restrictions first.",
        "Avoid broad recursive listings and full-file dumps. Narrow the query before truncating output; do not use a broad search piped to head as the default. If output is truncated, say so and do not treat it as exhaustive.",
        ...helperGuidance,
      ],
      runAlongside: false,
      safeToRerun: false,
      run: ({ command, timeout }) =>
        runner.run({ command, cwd: workspace, timeout: Duration.seconds(timeout) }).pipe(
          Effect.mapError((error) => new ToolFailed({ message: error.message })),
          Effect.map((result) => ({ result: report(result, timeout), details: result.end })),
        ),
    }),
  );
});

export const layer = Layer.effectDiscard(make);
