/** Read tool: whole files, windows of lines, and missing files. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option, Path, Schema } from "effect";

import files from "@liminal/files";
import { Directories, KeyedRegistry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import { Tools } from "@liminal/tools/contract";

import toolsRead from "../plugin.ts";

const stack = serverOf(toolsRead).pipe(
  Layer.provideMerge(serverOf(files)),
  Layer.provideMerge(KeyedRegistry.layer(Tools, (tool) => tool.spec.name)),
  Layer.provideMerge(testBaseServices),
);

const read = (params: Schema.Json) =>
  Effect.gen(function* () {
    const tool = Option.getOrThrow(yield* (yield* Tools).get("read"));

    return yield* tool.run(params, { sessionId: SessionId.make("s1"), callId: "c1" });
  });

effectTest(
  "read returns a whole file, or a window of lines with where to read on",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspace = (yield* Directories).workspace;
    yield* fs.writeFileString(path.join(workspace, "a.txt"), "one\ntwo\nthree\nfour");

    expect((yield* read({ path: "a.txt" })).result).toBe("one\ntwo\nthree\nfour");

    expect((yield* read({ path: "a.txt", offset: 2, limit: 2 })).result).toBe(
      "two\nthree\n[lines 2-3 of 4; read on from offset 4]",
    );
  }),
  stack,
);

effectTest(
  "reading a missing file fails the call",
  Effect.gen(function* () {
    const failed = yield* Effect.flip(read({ path: "nope.txt" }));

    expect(failed.message).toContain("nope.txt");
  }),
  stack,
);
