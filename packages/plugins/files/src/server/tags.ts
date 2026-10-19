/**
 * The `@` tag source for the workspace: files and folders git does not ignore. A folder tag
 * attaches the folder's listing, one level deep; a picture tag attaches the picture; a file tag
 * attaches nothing, as the model reads the file itself.
 */

import { ByteSize, Effect, FileSystem, Option, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { type TagAttachment, TagImage, type TagRow, TagText } from "@liminal/inbox/contract";
import { Directories, type ImageMediaType } from "@liminal/sdk";

/** The most rows one query gives. */
const ROWS = 12;

/** Past this many names, a listing says how many more there are. */
const MAX_NAMES = 200;

const pictureTypes: Readonly<Record<string, ImageMediaType>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** The picture type of `file` by its extension; none for any other file. */
export const pictureType = (path: Path.Path, file: string) =>
  Option.fromUndefinedOr(pictureTypes[path.extname(file).toLowerCase()]);

/** Each path and every folder above it, folders ending in `/`. */
const withFolders = (files: ReadonlyArray<string>) => {
  const folders = new Set<string>();

  for (const file of files) {
    for (let slash = file.indexOf("/"); slash !== -1; slash = file.indexOf("/", slash + 1))
      folders.add(file.slice(0, slash + 1));
  }

  return [...folders, ...files];
};

/**
 * How many separate stretches of `text` hold `query`'s characters in order, ignoring case; fewer
 * reads as a closer match. None when `text` does not hold them all.
 */
const runsOf = (query: string, text: string) => {
  const lower = text.toLowerCase();
  let from = 0;
  let runs = 0;

  for (const char of query.toLowerCase()) {
    const found = lower.indexOf(char, from);
    if (found === -1) return Option.none<number>();
    if (found !== from || from === 0) runs += 1;
    from = found + 1;
  }

  return Option.some(runs);
};

/** The paths matching `query`, closest first, then shortest. */
export const ranked = (paths: ReadonlyArray<string>, query: string) =>
  paths
    .flatMap((candidate) =>
      Option.match(runsOf(query, candidate), {
        onNone: () => [],
        onSome: (runs) => [{ candidate, runs }],
      }),
    )
    .toSorted((a, b) => a.runs - b.runs || a.candidate.length - b.candidate.length)
    .slice(0, ROWS)
    .map((found) => found.candidate);

/** Runs git in `cwd`, giving what it wrote; nothing when it cannot run. */
const git = (cwd: string, args: ReadonlyArray<string>) =>
  Effect.flatMap(ChildProcessSpawner.ChildProcessSpawner, (spawner) =>
    spawner.string(ChildProcess.make("git", args, { cwd })),
  ).pipe(Effect.orElseSucceed(() => ""));

const splitNul = (output: string) => output.split("\0").filter((part) => part !== "");

/** A folder sorts before a file; then by name. */
const byKind = (a: string, b: string) =>
  Number(!a.endsWith("/")) - Number(!b.endsWith("/")) || a.localeCompare(b);

const listingText = (tag: string, names: ReadonlyArray<string>) => {
  const shown = names.toSorted(byKind).slice(0, MAX_NAMES);
  const more = names.length - shown.length;
  const tail = more > 0 ? [`and ${more} more`] : [];

  return [`Listing of @${tag}, one level deep:`, ...shown, ...tail].join("\n");
};

/** What the tag source works with. */
interface Tools {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspace: string;
  readonly home: string;
  readonly run: (cwd: string, args: ReadonlyArray<string>) => Effect.Effect<string>;
}

/** A found path as a row; a picture notes its size. */
const rowOf = (tools: Tools, found: string) =>
  Option.match(pictureType(tools.path, found), {
    onNone: (): Effect.Effect<TagRow> =>
      Effect.succeed({ kind: found.endsWith("/") ? "folder" : "file", path: found, tag: found }),
    onSome: () =>
      tools.fs.stat(tools.path.join(tools.workspace, found)).pipe(
        Effect.map((info): TagRow => ({
          kind: "image",
          path: found,
          tag: found,
          note: ByteSize.format(info.size),
        })),
        Effect.orElseSucceed((): TagRow => ({ kind: "image", path: found, tag: found })),
      ),
  });

/** The folder's names without `.git` and what git ignores; folders end in `/`. */
const listing = (tools: Tools, folder: string) =>
  Effect.gen(function* () {
    const all = (yield* tools.fs.readDirectory(folder)).filter((name) => name !== ".git");

    const names = yield* Effect.forEach(all, (name) =>
      tools.fs.stat(tools.path.join(folder, name)).pipe(
        Effect.map((info) => (info.type === "Directory" ? `${name}/` : name)),
        Effect.orElseSucceed(() => name),
      ),
    );

    // Without `--stdin`, git takes no `-z` here; a name git would quote just stays listed.
    const ignored = new Set(
      (yield* tools.run(folder, ["check-ignore", "--", ...names])).split("\n"),
    );

    return names.filter((name) => !ignored.has(name));
  });

/** What the file at `file` attaches: a folder its listing, a picture its bytes. */
const attachTo = (tools: Tools, tag: string, file: string, type: FileSystem.File.Info["type"]) => {
  if (type === "Directory")
    return Effect.map(listing(tools, file), (names) =>
      Option.some<TagAttachment>(TagText.make({ text: listingText(tag, names) })),
    );

  return Option.match(pictureType(tools.path, file), {
    onNone: () => Effect.succeedNone,
    onSome: (mediaType) =>
      Effect.map(tools.fs.readFile(file), (data) =>
        Option.some<TagAttachment>(TagImage.make({ data, mediaType })),
      ),
  });
};

export const makeFileTags = Effect.gen(function* () {
  const directories = yield* Directories;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const tools: Tools = {
    fs: yield* FileSystem.FileSystem,
    path: yield* Path.Path,
    workspace: directories.workspace,
    home: directories.home,
    run: (cwd, args) =>
      Effect.provideService(git(cwd, args), ChildProcessSpawner.ChildProcessSpawner, spawner),
  };

  const find = (query: string) =>
    tools
      .run(tools.workspace, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
      .pipe(
        Effect.map((output) => ranked(withFolders(splitNul(output)), query)),
        Effect.flatMap((found) => Effect.forEach(found, (row) => rowOf(tools, row))),
      );

  const resolve = (tag: string) => {
    if (tag === "~" || tag.startsWith("~/")) return tools.path.join(tools.home, tag.slice(1));

    return tools.path.resolve(tools.workspace, tag);
  };

  const attach = (tag: string) => {
    const file = resolve(tag);

    return tools.fs.stat(file).pipe(
      Effect.flatMap((info) => attachTo(tools, tag, file, info.type)),
      Effect.orElseSucceed(() => Option.none<TagAttachment>()),
    );
  };

  return { find, attach };
});
