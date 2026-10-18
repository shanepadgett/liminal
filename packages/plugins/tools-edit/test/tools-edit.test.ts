/**
 * File-changing tools: an edit must match exactly once and takes new text literally; a write makes
 * folders.
 */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option, Path } from "effect";

import files from "@liminal/files";
import { Directories, KeyedRegistry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import { Tools } from "@liminal/tools/contract";

import toolsEdit from "../plugin.ts";

const stack = serverOf(toolsEdit).pipe(
  Layer.provideMerge(serverOf(files)),
  Layer.provideMerge(KeyedRegistry.layer(Tools, (tool) => tool.spec.name)),
  Layer.provideMerge(testBaseServices),
);

const edit = (oldText: string, newText: string) =>
  Effect.gen(function* () {
    const tool = Option.getOrThrow(yield* (yield* Tools).get("edit"));
    const params = { path: "a.txt", oldText, newText };

    return yield* tool.run(params, { sessionId: SessionId.make("s1"), callId: "c1" });
  });

effectTest(
  "edit replaces text that appears once and refuses text that appears twice or not at all",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const file = path.join((yield* Directories).workspace, "a.txt");
    yield* fs.writeFileString(file, "one\ntwo\nthree\ntwo");

    expect((yield* Effect.flip(edit("two", "2"))).message).toBe(
      "oldText appears 2 times; include more text so it appears once",
    );

    expect((yield* Effect.flip(edit("four", "4"))).message).toBe(
      "oldText does not appear in the file",
    );

    expect((yield* edit("three\ntwo", "$& 3")).result).toBe("edited a.txt");
    expect(yield* fs.readFileString(file)).toBe("one\ntwo\n$& 3");
  }),
  stack,
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
