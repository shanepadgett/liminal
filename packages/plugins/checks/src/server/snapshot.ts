/**
 * Snapshots of the files git sees as changed under the workspace, each with a text that changes
 * when its content does, so a comparison finds what a call changed however it changed it.
 */

import { Duration, Effect, FileSystem, Option, Path } from "effect";

import { CommandRunner } from "@liminal/command-runner/contract";
import { Directories } from "@liminal/sdk";

/** Path from the workspace to its version text. */
export type Snapshot = ReadonlyMap<string, string>;

/** Larger files compare by size and change time, so a snapshot never reads them. */
const MAX_HASHED_BYTES = 2n * 1024n * 1024n;
const FILES_READ_AT_ONCE = 8;
const STATUS_CODE_LENGTH = 3;
const GIT_TIMEOUT = Duration.seconds(10);

/** The workspace's prefix in the repository, then its changed files as `git status -z` records. */
const STATUS_COMMAND =
  "git rev-parse --show-prefix && git status --porcelain=v1 -z --untracked-files=all -- .";

/**
 * Each record is a two-letter code, a space and a path from the repository root; a rename or copy
 * has a second record with the old path.
 */
const statusPaths = (records: ReadonlyArray<string>): ReadonlyArray<string> => {
  const paths: Array<string> = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    paths.push(record.slice(STATUS_CODE_LENGTH));

    if (record.startsWith("R") || record.startsWith("C")) {
      index += 1;
      paths.push(records[index] ?? "");
    }
  }

  return paths;
};

/** The changed paths from the workspace in `git rev-parse` and `git status` output. */
export const workspacePaths = (output: string): ReadonlyArray<string> => {
  const lineEnd = output.indexOf("\n");
  const prefix = output.slice(0, lineEnd);

  const records = output
    .slice(lineEnd + 1)
    .split("\0")
    .filter((record) => record !== "");

  return statusPaths(records).flatMap((path) =>
    path.startsWith(prefix) ? [path.slice(prefix.length)] : [],
  );
};

/** The paths that differ between two snapshots, sorted; a file changed and changed back is equal. */
export const changedPaths = (before: Snapshot, after: Snapshot): ReadonlyArray<string> =>
  [...new Set([...before.keys(), ...after.keys()])]
    .filter((path) => before.get(path) !== after.get(path))
    .toSorted();

export const makeSnapshots = Effect.gen(function* () {
  const runner = yield* CommandRunner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  const versionOf = Effect.fn("Checks.version")(function* (file: string) {
    const stat = yield* Effect.option(fs.stat(path.join(workspace, file)));
    if (Option.isNone(stat)) return "missing";

    const { type, size, mtime } = stat.value;

    if (type !== "File" || size > MAX_HASHED_BYTES) {
      const changedAt = Option.match(mtime, { onNone: () => 0, onSome: (date) => date.getTime() });

      return `size:${size}:${changedAt}`;
    }

    const bytes = yield* Effect.option(fs.readFile(path.join(workspace, file)));

    return Option.match(bytes, {
      onNone: () => "missing",
      onSome: (content) => `hash:${Bun.hash(content).toString()}`,
    });
  });

  /** None outside a git repository or when git fails, so the changes are unknown. */
  const take = Effect.fn("Checks.snapshot")(function* () {
    const status = yield* runner
      .run({ command: STATUS_COMMAND, cwd: workspace, timeout: GIT_TIMEOUT })
      .pipe(Effect.option);

    const isRead = Option.exists(status, ({ end }) => end.type === "exited" && end.code === 0);

    if (!isRead || Option.isNone(status)) return Option.none<Snapshot>();

    const versions = yield* Effect.forEach(
      workspacePaths(status.value.stdout),
      (file) => Effect.map(versionOf(file), (version) => [file, version] as const),
      { concurrency: FILES_READ_AT_ONCE },
    );

    const snapshot: Snapshot = new Map(versions);

    return Option.some(snapshot);
  });

  /** The commit HEAD names, `unborn` before the first commit; none outside a git repository. */
  const headOf = Effect.fn("Checks.head")(function* () {
    const result = yield* runner
      .run({
        command:
          "git rev-parse --verify --quiet HEAD || { git rev-parse --git-dir >/dev/null && echo unborn; }",
        cwd: workspace,
        timeout: GIT_TIMEOUT,
      })
      .pipe(Effect.option);

    const head = Option.filter(
      Option.map(result, ({ stdout }) => stdout.trim()),
      (text) => text !== "",
    );

    return head;
  });

  return { take, headOf };
});
