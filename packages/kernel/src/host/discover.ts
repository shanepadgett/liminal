/** Finds plugin manifests in folders of packages whose `package.json` has a `liminal` key. */

import { Cause, Data, Effect, Exit, FileSystem, Path, Schema } from "effect";

import { ManifestModule, type Manifest } from "./manifest.ts";

/** The `liminal` key lists the package's manifest paths, relative to the package. */
const PackageJson = Schema.fromJsonString(
  Schema.Struct({ liminal: Schema.optional(Schema.Array(Schema.String)) }),
);

export type Discovered = Data.TaggedEnum<{
  Found: { readonly manifest: Manifest };
  /** Named by its path, since a manifest that fails to load has no name to read. */
  Broken: { readonly name: string; readonly cause: Cause.Cause<unknown> };
}>;

const Discovered = Data.taggedEnum<Discovered>();

const importManifest = Effect.fn("importManifest")(function* (path: string) {
  const exit = yield* Effect.tryPromise(() => import(path)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ManifestModule)),
    Effect.exit,
  );

  return Exit.isSuccess(exit)
    ? Discovered.Found({ manifest: exit.value.default })
    : Discovered.Broken({ name: path, cause: exit.cause });
});

const manifestPaths = Effect.fn("manifestPaths")(function* (packageDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packageJson = path.join(packageDir, "package.json");
  if (!(yield* fs.exists(packageJson))) return [];

  const { liminal } = yield* fs
    .readFileString(packageJson)
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(PackageJson)));

  return (liminal ?? []).map((manifest) => path.resolve(packageDir, manifest));
});

/** A package whose `package.json` cannot be read is one broken plugin, named by its folder. */
const discoverPackage = Effect.fn("discoverPackage")(function* (packageDir: string) {
  const paths = yield* Effect.exit(manifestPaths(packageDir));
  if (Exit.isFailure(paths)) return [Discovered.Broken({ name: packageDir, cause: paths.cause })];

  return yield* Effect.forEach(paths.value, importManifest, { concurrency: "unbounded" });
});

const isDirectory = Effect.fn("isDirectory")(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;

  return yield* fs.stat(path).pipe(
    Effect.map((info) => info.type === "Directory"),
    Effect.orElseSucceed(() => false),
  );
});

/** Every manifest in the packages directly inside `folders`; missing folders and files are skipped. */
export const discover = Effect.fn("discover")(function* (folders: ReadonlyArray<string>) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const packageDirs: Array<string> = [];

  for (const folder of folders) {
    if (!(yield* fs.exists(folder).pipe(Effect.orDie))) continue;

    const entries = yield* fs.readDirectory(folder).pipe(Effect.orDie);
    const paths = entries.map((entry) => path.join(folder, entry));
    packageDirs.push(...(yield* Effect.filter(paths, isDirectory)));
  }

  const found = yield* Effect.forEach(packageDirs, discoverPackage, { concurrency: "unbounded" });

  return found.flat();
});
