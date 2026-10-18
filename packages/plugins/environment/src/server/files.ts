/**
 * The files section: the workspace two levels deep, folders ending in `/`. In a git repository it
 * leaves out what git ignores; elsewhere it leaves out names starting with a dot.
 */

import { Effect, Schema } from "effect";

import type { Lines } from "@liminal/context/contract";

import { gitTimeout, isRepository, type Workspace } from "./workspace.ts";

/** Past this many lines, the listing says how many more there are. */
const maxLines = 200;

const statConcurrency = 16;

/** Git could not list the repository's files. */
class ListingFailed extends Schema.TaggedError<ListingFailed, { readonly brand: unique symbol }>()(
  "ListingFailed",
  { message: Schema.String },
) {}

/** Each path cut to its first one and two levels; a cut path ends in `/`. */
export const twoLevels = (paths: ReadonlyArray<string>): Lines => {
  const lines = new Set<string>();

  for (const file of paths) {
    const parts = file.split("/");

    for (const depth of [1, 2]) {
      if (parts.length < depth) continue;
      lines.add(parts.slice(0, depth).join("/") + (parts.length > depth ? "/" : ""));
    }
  }

  return [...lines].toSorted();
};

const capped = (lines: Lines): Lines =>
  lines.length > maxLines
    ? [...lines.slice(0, maxLines), `and ${lines.length - maxLines} more`]
    : lines;

/** Tracked and untracked files git does not ignore. */
const repositoryPaths = Effect.fn("repositoryPaths")(function* ({ runner, folder }: Workspace) {
  const result = yield* runner.run({
    command: "git ls-files -z --cached --others --exclude-standard",
    cwd: folder,
    timeout: gitTimeout,
  });

  if (result.end.type !== "exited" || result.end.code !== 0) {
    return yield* new ListingFailed({ message: result.stderr.trim() });
  }

  return result.stdout.split("\0").filter((file) => file !== "");
});

/** The visible names in `folder` as lines under `prefix`; a folder ends in `/`. */
const linesIn = Effect.fn("linesIn")(function* (
  { fs, path }: Workspace,
  folder: string,
  prefix: string,
) {
  const names = (yield* fs.readDirectory(folder)).filter((name) => !name.startsWith("."));

  return yield* Effect.forEach(
    names,
    (name) =>
      fs.stat(path.join(folder, name)).pipe(
        Effect.map((info) => `${prefix}${name}${info.type === "Directory" ? "/" : ""}`),
        // A broken link still has a name worth showing.
        Effect.orElseSucceed(() => `${prefix}${name}`),
      ),
    { concurrency: statConcurrency },
  );
});

/** Outside a repository: the visible names in the workspace and in each of its folders. */
const folderLines = Effect.fn("folderLines")(function* (workspace: Workspace) {
  const top = yield* linesIn(workspace, workspace.folder, "");

  const below = yield* Effect.forEach(top, (line) =>
    line.endsWith("/")
      ? linesIn(workspace, workspace.path.join(workspace.folder, line), line).pipe(
          // An unreadable folder is listed without its contents.
          Effect.orElseSucceed((): Lines => []),
        )
      : Effect.succeed<Lines>([]),
  );

  return [...top, ...below.flat()].toSorted();
});

/** The listing, capped at `maxLines`. */
export const fileLines = Effect.fn("fileLines")(function* (workspace: Workspace) {
  const lines = (yield* isRepository(workspace))
    ? twoLevels(yield* repositoryPaths(workspace))
    : yield* folderLines(workspace);

  return capped(lines);
});
