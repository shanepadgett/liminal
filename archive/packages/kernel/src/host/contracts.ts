/**
 * Serves each plugin package's contract to every plugin that imports it from the folder the host
 * loaded that package from, so an outside plugin gets the same contract files as the built-ins and
 * never its own installed copy. Each plugin graph still loads its own instance of those files, so a
 * reload of the package reaches its dependents.
 */

import { Effect, FileSystem, Option, Path, Schema } from "effect";

import { ExportTarget, isServedShared, targetOf } from "./modules.ts";

/** Two plugin folders hold packages with the same name; the first one found keeps it. */
export class PackageNameTaken extends Schema.TaggedError<
  PackageNameTaken,
  { readonly brand: unique symbol }
>()("PackageNameTaken", { packageName: Schema.String, dir: Schema.String, owner: Schema.String }) {}

/** A plugin package is named like a package the host shares, such as `effect`. */
export class SharedPackageName extends Schema.TaggedError<
  SharedPackageName,
  { readonly brand: unique symbol }
>()("SharedPackageName", { packageName: Schema.String, dir: Schema.String }) {}

const PackageJson = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.optionalKey(Schema.String),
    exports: Schema.optionalKey(Schema.Record(Schema.String, ExportTarget)),
  }),
);

/** The package that owns a name: its folder, its served files by specifier, and its loads. */
interface Owner {
  readonly dir: string;
  files: ReadonlyMap<string, string>;
  holders: number;
}

/**
 * Package names and their owners. Bun plugins are process-wide and cannot be removed, so every
 * kernel in the process shares one record; a name whose owner has no loads left can move.
 */
const owners = new Map<string, Owner>();

/** Specifiers with a module callback already registered. */
const served = new Set<string>();

/** Re-exports the owner's file, loaded fresh in the importing plugin's graph. */
const contractModule = (name: string, specifier: string) => (): Bun.OnLoadResultSourceCode => {
  const file = owners.get(name)?.files.get(specifier);

  if (file === undefined)
    return {
      contents: `throw new Error(${JSON.stringify(`${name} no longer exports ${specifier}`)});`,
      loader: "js",
    };

  return { contents: `export * from ${JSON.stringify(file)};`, loader: "ts" };
};

const serve = (name: string, specifiers: ReadonlyArray<string>) => {
  const fresh = specifiers.filter((specifier) => !served.has(specifier));
  if (fresh.length === 0) return;

  for (const specifier of fresh) served.add(specifier);

  Bun.plugin({
    name: `liminal-contracts:${name}`,
    setup: (builder) => {
      for (const specifier of fresh) builder.module(specifier, contractModule(name, specifier));
    },
  });
};

/** The package's name and the files its exports other than the manifest (`.`) map to. */
const readPackage = Effect.fn("readPackage")(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const json = yield* fs
    .readFileString(path.join(dir, "package.json"))
    .pipe(Effect.flatMap(Schema.decodeUnknownEffect(PackageJson)), Effect.option);

  if (Option.isNone(json) || json.value.name === undefined) return Option.none();
  const { name, exports = {} } = json.value;

  const files = Object.entries(exports).flatMap(([key, value]): ReadonlyArray<[string, string]> => {
    const target = key === "." ? undefined : targetOf(value);

    return target === undefined ? [] : [[`${name}${key.slice(1)}`, path.join(dir, target)]];
  });

  return Option.some({ name, files: new Map(files) });
});

/**
 * Claims the name of the package in `dir` and serves its contracts; returns the release for when
 * the load is dropped, as `{ release }`. A folder with no named package claims nothing.
 */
export const claimPackage = Effect.fn("claimPackage")(function* (dir: string) {
  const found = yield* readPackage(dir);
  if (Option.isNone(found)) return { release: Effect.void };
  const { name, files } = found.value;

  if (isServedShared(name)) return yield* new SharedPackageName({ packageName: name, dir });
  const owner = owners.get(name);

  if (owner !== undefined && owner.holders > 0 && owner.dir !== dir)
    return yield* new PackageNameTaken({ packageName: name, dir, owner: owner.dir });

  const claimed: Owner = owner?.dir === dir ? owner : { dir, files, holders: 0 };

  yield* Effect.sync(() => {
    claimed.files = files;
    claimed.holders += 1;
    owners.set(name, claimed);
    serve(name, [...files.keys()]);
  });

  return {
    release: Effect.sync(() => {
      claimed.holders -= 1;
    }),
  };
});
