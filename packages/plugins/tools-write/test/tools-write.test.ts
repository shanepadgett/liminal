/** Write tool: a write makes the folders it needs and replaces the whole file. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option, Path } from "effect";

import { Directories, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import toolRegistry from "@liminal/tool-registry";
import { Tools } from "@liminal/tool-registry/contract";

import toolsWrite from "../plugin.ts";

const stack = serverOf(toolsWrite).pipe(
  Layer.provideMerge(serverOf(toolRegistry)),
  Layer.provideMerge(testBaseServices),
);

const write = (file: string, content: string) =>
  Effect.gen(function* () {
    const tool = Option.getOrThrow(yield* (yield* Tools).get("write"));

    return yield* tool.run(
      { path: file, content },
      { sessionId: SessionId.make("s1"), callId: "c1" },
    );
  });

effectTest(
  "write makes folders and replaces the whole file",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join((yield* Directories).workspace, "notes/a.txt");

    expect((yield* write("notes/a.txt", "first draft")).result).toBe("wrote notes/a.txt");
    yield* write("notes/a.txt", "second");

    expect(yield* fs.readFileString(target)).toBe("second");
  }),
  stack,
);
