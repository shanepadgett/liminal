/** Finds plugin packages in folders: each folder directly inside one is a package. */

import { Effect, FileSystem, Path } from "effect";

import { loadPackage, type PluginPackage } from "./packages.ts";

const isDirectory = Effect.fn("isDirectory")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;

  return yield* fs.stat(path).pipe(
    Effect.map((info) => info.type === "Directory"),
    Effect.orElseSucceed(() => false),
  );
});

/** The package folders directly inside `folders`; missing folders are skipped. */
const packageDirs = Effect.fn("packageDirs")(function* (folders: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dirs: Array<string> = [];

  for (const folder of folders) {
    if (!(yield* fs.exists(folder).pipe(Effect.orDie))) continue;

    const entries = yield* fs.readDirectory(folder).pipe(Effect.orDie);
    const paths = entries.map((entry) => path.join(folder, entry));
    dirs.push(...(yield* Effect.filter(paths, isDirectory)));
  }

  return dirs;
});

/**
 * Every package in `folders`: the load `reuse` returns for a package, or a fresh one. A package
 * with no `package.json` loads with no manifests.
 */
export const discover = Effect.fn("discover")(function* (
  folders: ReadonlyArray<string>,
  reuse: (dir: string) => PluginPackage | undefined,
) {
  const dirs = yield* packageDirs(folders);

  return yield* Effect.forEach(
    dirs,
    (dir) => {
      const kept = reuse(dir);

      return kept === undefined ? loadPackage(dir) : Effect.succeed(kept);
    },
    { concurrency: "unbounded" },
  );
});
