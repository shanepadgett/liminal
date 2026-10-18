/**
 * The app's reload options: watches the plugins and its own code, typechecks the repository, and
 * reads the reload mode from settings.
 */

import { Context, Effect, FileSystem, Option, Path, Schema, Stream } from "effect";
import { ChildProcess } from "effect/process";

import type { ReloadMode, ReloadOptions } from "@liminal/kernel";
import type { HoldGraph } from "@liminal/sdk";
import { Settings } from "@liminal/settings/contract";

import { repoRoot, restartRoots } from "./boot.ts";

/** The `reload` settings section; checked code applies on its own unless `mode` is `confirmed`. */
const ReloadSection = Schema.Struct({
  mode: Schema.optionalKey(Schema.Literals(["automatic", "confirmed"])),
});

/**
 * The mode in settings. Without the settings plugin, or with a section that does not decode, code
 * applies on its own, as with no section at all.
 */
const readMode = (use: HoldGraph): Effect.Effect<ReloadMode> =>
  use((services) =>
    Option.match(Context.getOption(services, Settings), {
      onNone: () => Effect.succeed<ReloadMode>("automatic"),
      onSome: (settings) =>
        settings.section("reload", ReloadSection).pipe(
          Effect.map((section): ReloadMode => section.mode ?? "automatic"),
          Effect.orElseSucceed((): ReloadMode => "automatic"),
        ),
    }),
  );

const exists = (fs: FileSystem.FileSystem) => (folder: string) =>
  fs.exists(folder).pipe(Effect.orElseSucceed(() => false));

const isWatched = (file: string) => !file.split("/").includes("node_modules");

/** Changed files under `folders`, absolute, in batches gathered over 100 ms. */
const watchAll = (fs: FileSystem.FileSystem, path: Path.Path, folders: ReadonlyArray<string>) =>
  Stream.mergeAll(
    folders.map((folder) =>
      fs.watch(folder, { recursive: true }).pipe(
        Stream.map((event) => path.resolve(folder, event.path)),
        Stream.filter(isWatched),
      ),
    ),
    { concurrency: "unbounded" },
  ).pipe(
    Stream.groupedWithin(1000, "100 millis"),
    Stream.map((files) => [...new Set(files)]),
    // A watcher that fails stops reloads; the running code stays.
    Stream.catchCause(() => Stream.empty),
  );

/**
 * Reload options for the app run from source, watching the plugin `folders` that exist at start; a
 * folder made later is watched from the next start.
 */
export const reloadOptions = Effect.fn("reloadOptions")(function* (folders: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = repoRoot(path);
  const roots = restartRoots(path);
  const options = { cwd: root, extendEnv: true };

  const reload: ReloadOptions = {
    changes: watchAll(fs, path, [...(yield* Effect.filter(folders, exists(fs))), ...roots]),
    restartRoots: roots,
    typecheck: Option.some(
      ChildProcess.make("bunx", ["--bun", "--no-install", "tsc", "--noEmit"], options),
    ),
    startCheck: ChildProcess.make(
      process.execPath,
      [path.join(import.meta.dir, "main.ts"), "--check"],
      options,
    ),
    mode: readMode,
  };

  return reload;
});
