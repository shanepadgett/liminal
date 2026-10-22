/**
 * The workspace's files and folders as tags. The list is Git's: tracked files and untracked ones
 * not ignored, with each folder on their paths; outside a repository it is empty. Any path under
 * the workspace attaches, listed or not.
 */
import { Effect, FileSystem, Option, Path, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { Directories } from "@shanepadgett/liminal-directories/contract";

import { type TagRow, type TagSource, windowOf } from "./contract.ts";

/** How many entries a folder tag lists. */
const MAX_ENTRIES = 200;

/** Git calls a file binary when its first 8 KB hold a NUL byte. */
const BINARY_PROBE_BYTES = 8000;

const GIT_FILES = ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];

/** The folders on `files`' paths, each ending in `/`. */
const foldersOf = (files: ReadonlyArray<string>) => {
  const folders = new Set<string>();

  for (const file of files) {
    const parts = file.split("/");

    for (let end = 1; end < parts.length; end += 1) {
      folders.add(`${parts.slice(0, end).join("/")}/`);
    }
  }

  return [...folders];
};

const isBinary = (bytes: Uint8Array) => bytes.subarray(0, BINARY_PROBE_BYTES).includes(0);

export const workspaceSource = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const files = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  const gitFiles = Effect.gen(function* () {
    const handle = yield* spawner.spawn(
      ChildProcess.make("git", GIT_FILES, { cwd: workspace, stdin: "ignore", stderr: "ignore" }),
    );

    const [stdout, code] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(handle.stdout)), handle.exitCode],
      { concurrency: "unbounded" },
    );

    return code === 0 ? stdout.split("\0").filter((file) => file !== "") : [];
  }).pipe(
    Effect.scoped,
    Effect.orElseSucceed((): ReadonlyArray<string> => []),
  );

  const rows = Effect.map(gitFiles, (listed): ReadonlyArray<TagRow> => [
    ...foldersOf(listed).map((tag) => ({ kind: "folder" as const, tag })),
    ...listed.map((tag) => ({ kind: "file" as const, tag })),
  ]);

  /** The entry's name, with `/` after a folder's. */
  const entryOf = (folder: string, entry: string) =>
    Effect.map(Effect.option(files.stat(path.join(folder, entry))), (info) =>
      Option.exists(info, ({ type }) => type === "Directory") ? `${entry}/` : entry,
    );

  const folderText = (target: string, name: string) =>
    Effect.gen(function* () {
      const entries = (yield* files.readDirectory(target)).toSorted();

      const shown = yield* Effect.forEach(entries.slice(0, MAX_ENTRIES), (entry) =>
        entryOf(target, entry),
      );

      const more = entries.length - shown.length;
      const lines = more > 0 ? [...shown, `[and ${more} more]`] : shown;

      return `<folder name="${name}">\n${lines.join("\n")}\n</folder>`;
    }).pipe(Effect.orElseSucceed(() => `<folder name="${name}">could not be read</folder>`));

  const fileText = (target: string, name: string) =>
    Effect.gen(function* () {
      const bytes = yield* files.readFile(target);
      if (isBinary(bytes)) return `<file name="${name}">binary file, not shown</file>`;

      return `<file name="${name}">\n${windowOf(new TextDecoder().decode(bytes))}\n</file>`;
    }).pipe(Effect.orElseSucceed(() => `<file name="${name}">could not be read</file>`));

  const attach = (tag: string) =>
    Effect.gen(function* () {
      const target = path.resolve(workspace, tag);
      const isInside = target === workspace || target.startsWith(`${workspace}${path.sep}`);
      if (!isInside) return Option.none<string>();

      const info = yield* Effect.option(files.stat(target));
      if (Option.isNone(info)) return Option.none<string>();

      if (info.value.type === "Directory") {
        return Option.some(yield* folderText(target, tag.endsWith("/") ? tag : `${tag}/`));
      }

      return Option.some(yield* fileText(target, tag));
    });

  const source: TagSource = { rows, attach };

  return source;
});
