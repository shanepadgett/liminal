/** Workspace files: paths resolve in the workspace, writes make folders, failures name the file. */

import { expect } from "bun:test";

import { Effect, Layer, Path } from "effect";

import { Directories } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import files from "../plugin.ts";
import { WorkspaceFiles } from "../src/contract.ts";

const stack = serverOf(files).pipe(Layer.provideMerge(testBaseServices));

effectTest(
  "a write makes its folders and a read returns what was written",
  Effect.gen(function* () {
    const workspace = yield* WorkspaceFiles;
    const path = yield* Path.Path;

    expect(workspace.resolve("notes/a.txt")).toBe(
      path.join((yield* Directories).workspace, "notes/a.txt"),
    );

    yield* workspace.write("notes/a.txt", "first");
    expect(yield* workspace.read("notes/a.txt")).toBe("first");
  }),
  stack,
);

effectTest(
  "a missing file fails with its path",
  Effect.gen(function* () {
    const failed = yield* Effect.flip((yield* WorkspaceFiles).read("missing.txt"));

    expect(failed.path).toBe("missing.txt");
  }),
  stack,
);
