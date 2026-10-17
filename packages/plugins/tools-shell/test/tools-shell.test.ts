/** Shell tool: output and exit code of a command run in the workspace. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option, Path } from "effect";

import commandRunner from "@liminal/command-runner";
import { Directories, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import toolRegistry from "@liminal/tool-registry";
import { Tools } from "@liminal/tool-registry/contract";

import toolsShell from "../plugin.ts";

const stack = serverOf(toolsShell).pipe(
  Layer.provideMerge(serverOf(commandRunner)),
  Layer.provideMerge(serverOf(toolRegistry)),
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
    const path = yield* Path.Path;
    const workspace = yield* fs.realPath(path.dirname((yield* Directories).project));

    const output = yield* shell("pwd; echo oops >&2; exit 2");

    expect(output).toEqual({
      result: `${workspace}\n[stderr]\noops\n[exit code 2]`,
      details: { type: "exited", code: 2 },
    });
  }),
  stack,
);
