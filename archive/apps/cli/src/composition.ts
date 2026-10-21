/**
 * The app's `plugins.json` files: which plugins run, and which folders the user trusts. The global
 * file holds the trusted folders; the project's file and plugins load only in a trusted workspace.
 */

import { Effect, FileSystem, Layer, Path, Schema, Semaphore } from "effect";

import type { Composition } from "@liminal/kernel";
import {
  CompositionInvalid,
  CompositionWriteFailed,
  Directories,
  editJson,
  parseJsonObject,
  ProjectTrust,
} from "@liminal/sdk";

import { pluginsFolder } from "./boot.ts";

/** One `plugins.json`; a missing key is empty. */
const PluginsFile = Schema.Struct({
  plugins: Schema.Record(Schema.String, Schema.Boolean).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({})),
  ),
  trustedFolders: Schema.Array(Schema.String).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([])),
  ),
});

type PluginsFile = typeof PluginsFile.Type;

const decodeFile = Schema.decodeUnknownEffect(PluginsFile);

/** The global and the project `plugins.json`. */
export const compositionFiles = Effect.gen(function* () {
  const path = yield* Path.Path;
  const directories = yield* Directories;

  return {
    global: path.join(directories.global, "plugins.json"),
    project: path.join(directories.project, "plugins.json"),
  };
});

/** `file`'s text; a missing file is empty. */
const readText = Effect.fn("readText")(function* (file: string) {
  const fs = yield* FileSystem.FileSystem;

  const fail = (error: { readonly message: string }) =>
    new CompositionInvalid({ file, message: error.message });

  const exists = yield* Effect.mapError(fs.exists(file), fail);
  if (!exists) return "";

  return yield* Effect.mapError(fs.readFileString(file), fail);
});

/** `text` as a `plugins.json`. */
const parseFile = (file: string, text: string) =>
  Effect.fromResult(parseJsonObject(text)).pipe(
    Effect.mapError((message) => new CompositionInvalid({ file, message })),
    Effect.flatMap((parsed) =>
      Effect.mapError(
        decodeFile(parsed),
        (error) => new CompositionInvalid({ file, message: error.message }),
      ),
    ),
  );

const readFile = (file: string) => Effect.flatMap(readText(file), (text) => parseFile(file, text));

const emptyFile: PluginsFile = { plugins: {}, trustedFolders: [] };

/** Whether `workspace` is one of `folders` or inside one: trusting a folder trusts its subfolders. */
const isTrusted = (path: Path.Path, folders: ReadonlyArray<string>, workspace: string) =>
  folders.some((folder) => {
    const relative = path.relative(path.resolve(folder), workspace);

    const outside = relative === ".." || relative.startsWith(`..${path.sep}`);

    return !outside && !path.isAbsolute(relative);
  });

/**
 * The composition the kernel builds: the built-in, user and, once trusted, project plugin folders,
 * and the project's choices over the global ones.
 */
export const readComposition = Effect.gen(function* () {
  const path = yield* Path.Path;
  const directories = yield* Directories;
  const files = yield* compositionFiles;
  const global = yield* readFile(files.global);
  const trusted = isTrusted(path, global.trustedFolders, directories.workspace);
  const project = trusted ? yield* readFile(files.project) : emptyFile;
  const projectFolders = trusted ? [path.join(directories.project, "plugins")] : [];

  const composition: Composition = {
    folders: [
      ...new Set([
        pluginsFolder(path),
        path.join(directories.global, "plugins"),
        ...projectFolders,
      ]),
    ],
    choices: new Map([...Object.entries(global.plugins), ...Object.entries(project.plugins)]),
  };

  return composition;
});

/**
 * `readComposition` over this fiber's services, so the kernel can read it again on each graph
 * change.
 */
export const compositionSource = Effect.map(
  Effect.context<FileSystem.FileSystem | Path.Path | Directories>(),
  (context) => Effect.provideContext(readComposition, context),
);

/** Trust read from and written to the global `plugins.json`, keeping its comments. */
export const projectTrust = Layer.effect(
  ProjectTrust,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { workspace } = yield* Directories;
    const { global: file } = yield* compositionFiles;
    const writes = yield* Semaphore.make(1);

    const trusted = Effect.map(readFile(file), (read) =>
      isTrusted(path, read.trustedFolders, workspace),
    );

    const trust = Effect.gen(function* () {
      const text = yield* readText(file);
      const { trustedFolders } = yield* parseFile(file, text);
      if (isTrusted(path, trustedFolders, workspace)) return;

      const edited = editJson(text, ["trustedFolders"], [...trustedFolders, workspace]);

      yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
        Effect.andThen(fs.writeFileString(file, edited)),
        Effect.mapError((error) => new CompositionWriteFailed({ file, message: error.message })),
      );
    });

    return ProjectTrust.of({
      trusted: trusted.pipe(Effect.provideService(FileSystem.FileSystem, fs)),
      trust: writes.withPermits(1)(trust.pipe(Effect.provideService(FileSystem.FileSystem, fs))),
    });
  }),
);
