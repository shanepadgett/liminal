/** File tools: windows of lines, writes that make folders, and edits that must match once. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Option, Path, Schema } from "effect";

import { Directories, SessionId, type ToolOutput } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import toolRegistry from "@liminal/tool-registry";
import { Tools } from "@liminal/tool-registry/contract";

import toolsFile from "../plugin.ts";

const stack = serverOf(toolsFile).pipe(
  Layer.provideMerge(serverOf(toolRegistry)),
  Layer.provideMerge(testBaseServices),
);

const context = { sessionId: SessionId.make("s1"), callId: "c1" };

/** Runs tool `name` with `params`. */
const call = (name: string, params: Schema.Json) =>
  Effect.gen(function* () {
    const tools = yield* Tools;
    const tool = yield* tools.get(name);

    return yield* Option.getOrThrow(tool).run(params, context);
  });

const resultOf = (output: ToolOutput) => output.result;

effectTest(
  "write makes folders, read returns a window of lines, edit replaces one match",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspace = path.dirname((yield* Directories).project);

    yield* call("write", { path: "notes/a.txt", content: "one\ntwo\nthree\ntwo" });

    expect(yield* fs.readFileString(path.join(workspace, "notes/a.txt"))).toBe(
      "one\ntwo\nthree\ntwo",
    );

    expect(resultOf(yield* call("read", { path: "notes/a.txt" }))).toBe("one\ntwo\nthree\ntwo");

    expect(resultOf(yield* call("read", { path: "notes/a.txt", offset: 2, limit: 2 }))).toBe(
      "two\nthree\n[lines 2-3 of 4; read on from offset 4]",
    );

    const twice = yield* Effect.flip(
      call("edit", { path: "notes/a.txt", oldText: "two", newText: "2" }),
    );

    expect(twice.message).toBe("oldText appears 2 times; include more text so it appears once");

    const missing = yield* Effect.flip(
      call("edit", { path: "notes/a.txt", oldText: "four", newText: "4" }),
    );

    expect(missing.message).toBe("oldText does not appear in the file");

    yield* call("edit", { path: "notes/a.txt", oldText: "three\ntwo", newText: "$& 3" });
    expect(resultOf(yield* call("read", { path: "notes/a.txt" }))).toBe("one\ntwo\n$& 3");
  }),
  stack,
);

effectTest(
  "reading a missing file fails the call",
  Effect.gen(function* () {
    const failed = yield* Effect.flip(call("read", { path: "nope.txt" }));

    expect(failed.message).toContain("nope.txt");
  }),
  stack,
);
