/**
 * Loads a plugin package's manifests into a module graph of its own, so each load reads the
 * package's files fresh while older loads keep the code they read.
 */

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

/** One load of a plugin package; its manifests' later imports load into the same module graph. */
export interface PluginPackage {
  readonly dir: string;
  readonly discovered: ReadonlyArray<Discovered>;
  /** Drops the package's modules once nothing builds from them; referenced code keeps working. */
  readonly dispose: Effect.Effect<void>;
}

const importManifest = Effect.fn("importManifest")(function* (
  graph: Bun.ModuleGraph,
  path: string,
) {
  const exit = yield* Effect.tryPromise(() => graph.import<object>(path)).pipe(
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
export const loadPackage = Effect.fn("loadPackage")(function* (dir: string) {
  const graph = yield* Effect.sync(() => new Bun.ModuleGraph());

  const dispose = Effect.sync(() => {
    graph.dispose();
  });

  const paths = yield* Effect.exit(manifestPaths(dir));

  const discovered = Exit.isSuccess(paths)
    ? yield* Effect.forEach(paths.value, (path) => importManifest(graph, path), {
        concurrency: "unbounded",
      })
    : [Discovered.Broken({ name: dir, cause: paths.cause })];

  const loaded: PluginPackage = { dir, discovered, dispose };

  return loaded;
});
