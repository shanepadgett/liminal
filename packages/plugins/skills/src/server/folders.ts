/** Shared skill roots, ordered from global to nearest trusted project. */

import { Effect, type FileSystem, type Path } from "effect";

import { foldersDown } from "@liminal/context/contract";
import type { Directories, ProjectTrust } from "@liminal/sdk";

export interface Finder {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly directories: Directories["Service"];
  readonly trust: ProjectTrust["Service"];
}

/** The skills folders, most shared first. */
export const foldersOf = Effect.fn("skills.folders")(function* ({
  fs,
  path,
  directories,
  trust,
}: Finder) {
  const shared = [
    path.join(directories.home, ".agents", "skills"),
    path.join(directories.global, "skills"),
  ];

  const trusted = yield* trust.trusted.pipe(Effect.orElseSucceed(() => false));
  if (!trusted) return shared;

  const folders = yield* foldersDown(fs, path, directories.workspace);

  const liminal = (folder: string) =>
    folder === path.resolve(directories.workspace)
      ? directories.project
      : path.join(folder, ".liminal");

  return [
    ...shared,
    ...folders.flatMap((folder) => [
      path.join(folder, ".agents", "skills"),
      path.join(liminal(folder), "skills"),
    ]),
  ];
});
