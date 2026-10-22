/** The folders from `HOME` and the folder Liminal starts in, and the workspace for screens. */
import { Config, Effect, FileSystem, Layer, Option, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

import { Directories, DirectoriesRpc } from "./contract.ts";

const make = Effect.gen(function* () {
  const path = yield* Path.Path;
  const home = yield* Config.String("HOME");
  const workspace = path.resolve(".");

  return Directories.of({
    global: path.join(home, ".liminal"),
    workspace,
    project: path.join(workspace, ".liminal"),
  });
});

/** `ref: refs/heads/main` names the branch; a detached head is a commit id, shown short. */
const branchOf = (head: string) => {
  const line = head.trim();
  const ref = /^ref: refs\/heads\/(.+)$/.exec(line)?.[1];

  return ref ?? line.slice(0, 7);
};

/** `folder` with the home folder written `~`. */
const shortened = (folder: string, home: string) =>
  folder === home || folder.startsWith(`${home}/`) ? `~${folder.slice(home.length)}` : folder;

const rpc = DirectoriesRpc.toLayer(
  Effect.gen(function* () {
    const directories = yield* Directories;
    const files = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* Config.String("HOME");

    // Read on each call, so a branch switched while Liminal runs shows.
    const branch = files
      .readFileString(path.join(directories.workspace, ".git", "HEAD"))
      .pipe(Effect.map(branchOf), Effect.option);

    return DirectoriesRpc.of({
      "directories/workspace": () =>
        Effect.map(branch, (found) => ({
          folder: shortened(directories.workspace, home),
          branch: Option.getOrUndefined(found),
        })),
    });
  }),
);

export default definePlugin({
  name: "directories",
  provides: [Directories],
  requires: [Path.Path, FileSystem.FileSystem],
  layer: Layer.provideMerge(rpc, Layer.effect(Directories, make)),
});
