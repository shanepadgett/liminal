/** Shell tool: output and exit code of a command run in the workspace. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option } from "effect";

import commandRunner from "@liminal/command-runner";
import { CommandFailed, CommandRunner, type CommandResult } from "@liminal/command-runner/contract";
import { Directories, KeyedRegistry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import { Tools } from "@liminal/tools/contract";

import toolsShell from "../plugin.ts";

const stack = serverOf(toolsShell).pipe(
  Layer.provideMerge(serverOf(commandRunner)),
  Layer.provideMerge(KeyedRegistry.layer(Tools, (tool) => tool.spec.name)),
  Layer.provideMerge(testBaseServices),
);

const shell = (command: string) =>
  Effect.gen(function* () {
    const tools = yield* Tools;
    const tool = Option.getOrThrow(yield* tools.get("shell"));

    return yield* tool.run(
      { command, timeout: 60 },
      { sessionId: SessionId.make("s1"), callId: "c1" },
    );
  });

effectTest(
  "a command runs in the workspace and the model sees its output and exit code",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const workspace = yield* fs.realPath((yield* Directories).workspace);

    const output = yield* shell("pwd; echo oops >&2; exit 2");

    expect(output).toEqual({
      result: `${workspace}\n[stderr]\noops\n[exit code 2]`,
      details: { type: "exited", code: 2 },
    });
  }),
  stack,
);

effectTest(
  "the tool names the workspace and tells the model not to cd into it",
  Effect.gen(function* () {
    const { workspace } = yield* Directories;
    const tool = Option.getOrThrow(yield* (yield* Tools).get("shell"));

    expect(tool.spec.description).toContain(
      `starts in ${workspace} in a fresh shell, so do not cd`,
    );

    const guidance = tool.guidance.join("\n");
    expect(guidance).toContain("`process_start`");
    expect(guidance).toContain("Follow repository-specific commands and restrictions first");
    expect(guidance).toContain("Narrow the query before truncating output");
  }),
  stack,
);

const detectionStack = (result: Effect.Effect<CommandResult, CommandFailed>) =>
  serverOf(toolsShell).pipe(
    Layer.provideMerge(
      Layer.succeed(
        CommandRunner,
        CommandRunner.of({
          run: (spec) => {
            expect(spec.command).toContain("command -v rg");
            expect(spec.command).toContain("command -v fdfind");

            return result;
          },
        }),
      ),
    ),
    Layer.provideMerge(KeyedRegistry.layer(Tools, (tool) => tool.spec.name)),
    Layer.provideMerge(testBaseServices),
  );

for (const { name, result, expected } of [
  {
    name: "available helpers add targeted guidance",
    result: Effect.succeed({
      end: { type: "exited", code: 0 },
      stdout: "rg\nfd\njq\n",
      stderr: "",
    } satisfies CommandResult),
    expected: ["rg", "fd", "jq"],
  },
  {
    name: "the alternate fd executable name is used when installed",
    result: Effect.succeed({
      end: { type: "exited", code: 0 },
      stdout: "fdfind\n",
      stderr: "",
    } satisfies CommandResult),
    expected: ["fdfind"],
  },
  {
    name: "fd guidance is not duplicated when both names are installed",
    result: Effect.succeed({
      end: { type: "exited", code: 0 },
      stdout: "fd\nfdfind\n",
      stderr: "",
    } satisfies CommandResult),
    expected: ["fd"],
  },
  {
    name: "missing helpers add no helper guidance",
    result: Effect.succeed({
      end: { type: "exited", code: 0 },
      stdout: "",
      stderr: "",
    } satisfies CommandResult),
    expected: [],
  },
  {
    name: "a timed out probe does not advertise partial results",
    result: Effect.succeed({
      end: { type: "timed-out" },
      stdout: "rg\n",
      stderr: "",
    } satisfies CommandResult),
    expected: [],
  },
  {
    name: "an unsuccessful probe does not advertise partial results",
    result: Effect.succeed({
      end: { type: "exited", code: 1 },
      stdout: "rg\n",
      stderr: "",
    } satisfies CommandResult),
    expected: [],
  },
  {
    name: "a failed probe leaves the shell tool available",
    result: Effect.fail(new CommandFailed({ message: "Cannot start shell", cause: "test" })),
    expected: [],
  },
]) {
  effectTest(
    name,
    Effect.gen(function* () {
      const tool = Option.getOrThrow(yield* (yield* Tools).get("shell"));
      const helperGuidance = tool.guidance.filter((line) => line.startsWith("`"));
      expect(helperGuidance.map((line) => line.split("`")[1])).toEqual(expected);
    }),
    detectionStack(result),
  );
}
