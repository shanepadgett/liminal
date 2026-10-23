/**
 * The workspace root's entries, a folder's ending in `/`. In a repository the list is Git's, so
 * what Git ignores is left out; elsewhere names starting with a dot are.
 */
import { Effect, type FileSystem, Option, type Path, Stream } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";

import type { Directories } from "@shanepadgett/liminal-directories/contract";

/** Past this many entries, the list says how many more there are. */
const MAX_ENTRIES = 200;

export interface Root {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly directories: Directories["Service"];
}

/** Each path cut to its first part; a cut path ends in `/`. */
const firstParts = (paths: ReadonlyArray<string>) => [
  ...new Set(
    paths.map((file) => {
      const [first = file, ...rest] = file.split("/");

      return rest.length > 0 ? `${first}/` : first;
    }),
  ),
];

/** Tracked files and untracked ones Git does not ignore, under the workspace. */
const gitPaths = ({ spawner, directories }: Root) =>
  Effect.gen(function* () {
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: directories.workspace,
        stdin: "ignore",
        stderr: "ignore",
      }),
    );

    const listed = yield* Stream.mkString(Stream.decodeText(handle.stdout));

    return (yield* handle.exitCode) === 0 ? listed.split("\0").filter((file) => file !== "") : [];
  }).pipe(Effect.scoped);

/** The visible names in the workspace; a folder's ends in `/`. */
const visibleNames = Effect.fn("visibleNames")(function* ({ fs, path, directories }: Root) {
  const names = (yield* fs.readDirectory(directories.workspace)).filter(
    (name) => !name.startsWith("."),
  );

  return yield* Effect.forEach(names, (name) =>
    Effect.map(Effect.option(fs.stat(path.join(directories.workspace, name))), (info) =>
      Option.exists(info, ({ type }) => type === "Directory") ? `${name}/` : name,
    ),
  );
});

/** The entries, sorted and capped; none when they cannot be listed. */
export const rootEntries = (root: Root) =>
  Effect.gen(function* () {
    const entries = Option.isSome(root.directories.repository)
      ? firstParts(yield* gitPaths(root))
      : yield* visibleNames(root);

    const sorted = entries.toSorted();
    const more = sorted.length - MAX_ENTRIES;

    return more > 0 ? [...sorted.slice(0, MAX_ENTRIES), `and ${more} more`] : sorted;
  }).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
