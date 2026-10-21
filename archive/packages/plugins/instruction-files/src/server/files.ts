/**
 * Finding instruction files: `.md` files in the global `instructions/` folder and, in a trusted
 * workspace, in `.liminal/instructions/` from the repository root down to the workspace. A nearer
 * folder's file replaces a farther one of the same name.
 */

import { Effect, type FileSystem, type Path, Result } from "effect";

import { foldersDown, readFileTexts } from "@liminal/context/contract";
import type { Notice } from "@liminal/notices/contract";
import type { Directories, ProjectTrust } from "@liminal/sdk";

import { type Instruction, parseInstruction } from "./front-matter.ts";

export interface Finder {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly directories: Directories["Service"];
  readonly trust: ProjectTrust["Service"];
}

/** What a scan found: the instructions, the problems to tell, and whether a file failed to read. */
export interface Scan {
  readonly instructions: ReadonlyArray<Instruction>;
  readonly problems: ReadonlyArray<Notice>;
  readonly failed: boolean;
}

const FOLDER = "instructions";

/** The instruction folders, most shared first. */
const foldersOf = Effect.fn("foldersOf")(function* ({ fs, path, directories, trust }: Finder) {
  const global = path.join(directories.global, FOLDER);
  const trusted = yield* trust.trusted.pipe(Effect.orElseSucceed(() => false));
  if (!trusted) return [global];

  const folders = yield* foldersDown(fs, path, directories.workspace);

  const project = (folder: string) =>
    folder === path.resolve(directories.workspace)
      ? directories.project
      : path.join(folder, ".liminal");

  return [global, ...folders.map((folder) => path.join(project(folder), FOLDER))];
});

/** The `.md` files in `folder`, by name; none when it is missing or unreadable. */
const markdownIn = ({ fs, path }: Finder, folder: string) =>
  fs.readDirectory(folder).pipe(
    Effect.map((names) => names.filter((name) => name.endsWith(".md")).toSorted()),
    Effect.map((names) => names.map((name) => ({ name, file: path.join(folder, name) }))),
    Effect.orElseSucceed(() => []),
  );

/** Each file's path, the nearest folder's file for each name, most shared first. */
const pathsOf = Effect.fn("pathsOf")(function* (finder: Finder) {
  const found = yield* Effect.forEach(yield* foldersOf(finder), (folder) =>
    markdownIn(finder, folder),
  );

  const byName = new Map<string, string>();

  for (const { name, file } of found.flat()) {
    byName.delete(name);
    byName.set(name, file);
  }

  return [...byName.values()];
});

export const scan = Effect.fn("instruction-files.scan")(function* (finder: Finder) {
  const { files, failed } = yield* readFileTexts(finder.fs, yield* pathsOf(finder));
  const parsed = files.map((file) => ({ file, result: parseInstruction(file) }));

  const problems: ReadonlyArray<Notice> = [
    ...failed.map(({ path, message }): Notice => ({
      kind: "warning",
      title: "Couldn't read an instruction file",
      body: `${path}: ${message}`,
    })),
    ...parsed.flatMap(({ file, result }): ReadonlyArray<Notice> =>
      Result.isFailure(result)
        ? [
            {
              kind: "warning",
              title: "Skipped an instruction file",
              body: `${file.path}: ${result.failure}`,
            },
          ]
        : [],
    ),
  ];

  const found: Scan = {
    instructions: parsed.flatMap(({ result }) =>
      Result.isSuccess(result) ? [result.success] : [],
    ),
    problems,
    failed: failed.length > 0,
  };

  return found;
});
