/** `shell`: runs one foreground command with a fresh `bash` in the workspace. */
import { Effect, Layer } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import {
  defineTool,
  ToolFailed,
  type ToolOutput,
  Tools,
} from "@shanepadgett/liminal-tools/contract";

import { DEFAULT_TIMEOUT, MAX_TIMEOUT, ShellParams, shellName } from "./contract.ts";
import { installedTools } from "./installed.ts";
import { type Ending, runCommand } from "./run.ts";

const descriptionOf = (installed: ReadonlyArray<string>) => {
  const tools = installed.length === 0 ? "" : `\n\nInstalled: ${installed.join(", ")}.`;

  return `Run a command line with bash in the workspace and return its output.

Each call starts a fresh non-login bash, so \`cd\`, variables and functions last only for that call; chain steps with \`&&\`. stdin is closed, so a command that waits for input fails; pass flags such as \`--yes\`. Pagers are off.

stdout and stderr come back merged in the order they were written, then a line saying how the command ended, such as \`[exit code 1]\`. A nonzero exit is not a failed call; read the output. A command still running after \`timeout\` seconds (default ${DEFAULT_TIMEOUT}, at most ${MAX_TIMEOUT}) is stopped with everything it started.

Search files with \`rg\` when it is installed.${tools}`;
};

const endingLine = (ending: Ending) => {
  if (ending.kind === "exited") return `[exit code ${ending.code}]`;
  if (ending.kind === "signalled") return "[ended by a signal]";

  return `[stopped after ${ending.seconds} seconds]`;
};

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const { workspace } = yield* Directories;
    const installed = yield* installedTools(spawner);

    const shell = defineTool({
      name: shellName,
      description: descriptionOf(installed),
      input: ShellParams,
      run: (params, context) =>
        runCommand(spawner, params.command, {
          cwd: workspace,
          seconds: params.timeout ?? DEFAULT_TIMEOUT,
          onTail: (tail) => context.progress({ tail }),
        }).pipe(
          Effect.map(({ output, ending }): ToolOutput => {
            const ended = endingLine(ending);
            const text = output === "" ? ended : `${output.replace(/\n$/u, "")}\n${ended}`;

            return { content: [{ type: "text", text }] };
          }),
          Effect.mapError(
            (error) => new ToolFailed({ message: `bash could not start: ${error.message}` }),
          ),
        ),
    });

    yield* (yield* Tools).add(shell);
  }),
);

export default definePlugin({
  name: "tools-shell",
  provides: [],
  requires: [Tools, Directories, ChildProcessSpawner.ChildProcessSpawner],
  layer,
  entries: { tui: () => import("./tui/index.tsx") },
});
