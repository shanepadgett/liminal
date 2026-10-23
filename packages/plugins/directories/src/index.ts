/**
 * The folders from `HOME` and the folder Liminal starts in, its repository, and the workspace for
 * screens.
 */
import { Config, Effect, FileSystem, Layer, Option, Path } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";

import { Directories, DirectoriesRpc } from "./contract.ts";

/** `ref: refs/heads/main` names the branch; a detached head is a commit id, shown short. */
const branchOf = (head: string) => {
  const line = head.trim();
  const ref = /^ref: refs\/heads\/(.+)$/.exec(line)?.[1];

  return ref ?? line.slice(0, 7);
};

/** `folder` with the home folder written `~`. */
const shortened = (folder: string, home: string) =>
  folder === home || folder.startsWith(`${home}/`) ? `~${folder.slice(home.length)}` : folder;

const make = Effect.gen(function* () {
  const files = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* Config.String("HOME");
  const workspace = path.resolve(".");

  /** The nearest folder from `folder` up that holds `.git`. */
  const repositoryFrom = (folder: string): Effect.Effect<Option.Option<string>> =>
    Effect.gen(function* () {
      const hasGit = yield* files
        .exists(path.join(folder, ".git"))
        .pipe(Effect.orElseSucceed(() => false));

      if (hasGit) return Option.some(folder);

      const parent = path.dirname(folder);

      return parent === folder ? Option.none() : yield* repositoryFrom(parent);
    });

  const repository = yield* repositoryFrom(workspace);

  // Read on each call, so a branch switched while Liminal runs shows.
  const branch = Option.match(repository, {
    onNone: () => Effect.succeedNone,
    onSome: (root) =>
      files
        .readFileString(path.join(root, ".git", "HEAD"))
        .pipe(Effect.map(branchOf), Effect.option),
  });

  return Directories.of({
    global: path.join(home, ".liminal"),
    workspace,
    project: path.join(workspace, ".liminal"),
    repository,
    branch,
  });
});

const rpc = DirectoriesRpc.toLayer(
  Effect.gen(function* () {
    const directories = yield* Directories;
    const home = yield* Config.String("HOME");

    return DirectoriesRpc.of({
      "directories/workspace": () =>
        Effect.map(directories.branch, (found) => ({
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
