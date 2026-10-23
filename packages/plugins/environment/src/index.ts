/** Facts about where Liminal runs, as the `environment` system prompt section. */
import { Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Sections } from "@shanepadgett/liminal-system-prompt/contract";

import { factLines } from "./facts.ts";
import { type Root, rootEntries } from "./root.ts";

const environmentText = Effect.fn("environmentText")(function* (root: Root) {
  const facts = yield* factLines(root.directories);
  const entries = yield* rootEntries(root);
  const listing = entries.length === 0 ? [] : ["", "Workspace root:", ...entries];

  return ["<environment>", ...facts, ...listing, "</environment>"].join("\n");
});

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const root: Root = {
      fs: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      spawner: yield* ChildProcessSpawner.ChildProcessSpawner,
      directories: yield* Directories,
    };

    yield* (yield* Sections).add(
      { name: "environment", text: () => environmentText(root) },
      { order: 100 },
    );
  }),
);

export default definePlugin({
  name: "environment",
  provides: [],
  requires: [
    Sections,
    Directories,
    FileSystem.FileSystem,
    Path.Path,
    ChildProcessSpawner.ChildProcessSpawner,
  ],
  layer,
});
