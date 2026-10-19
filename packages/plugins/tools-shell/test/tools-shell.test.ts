/** Shell tool: output and exit code of a command run in the workspace. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option } from "effect";

import commandRunner from "@liminal/command-runner";
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

    return yield* tool.run({ command }, { sessionId: SessionId.make("s1"), callId: "c1" });
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

    expect(tool.spec.description).toContain(workspace);
    expect(tool.guidance.join("\n")).toContain(`starts in ${workspace}`);
    expect(tool.guidance.join("\n")).toContain("do not cd");
  }),
  stack,
);
