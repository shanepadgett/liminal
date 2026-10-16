/** Finds the version each dependency and tool is pinned to, and where each package is installed. */
import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

import { Schema } from "effect";

import type { ApiPointer, Source } from "./manifest.ts";

const Dependencies = Schema.optionalKey(Schema.Record(Schema.String, Schema.String));

const Lockfile = Schema.Struct({
  workspaces: Schema.Record(
    Schema.String,
    Schema.Struct({
      dependencies: Dependencies,
      devDependencies: Dependencies,
      peerDependencies: Dependencies,
      optionalDependencies: Dependencies,
    }),
  ),
  packages: Schema.Record(
    Schema.String,
    Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Unknown]),
  ),
});

const MiseConfig = Schema.Struct({
  tools: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

const decodeLockfile = Schema.decodeUnknownSync(Lockfile);
const decodeMiseConfig = Schema.decodeUnknownSync(MiseConfig);

/** A dependency at the version `bun.lock` resolved, and the first workspace that declares it. */
export interface Pin {
  readonly version: string;
  readonly workspace: string;
}

export interface Pins {
  /** Dependencies of every workspace, except other workspaces. */
  readonly packages: ReadonlyMap<string, Pin>;
  /** Tools pinned in `mise.toml`. */
  readonly tools: ReadonlyMap<string, string>;
}

const resolvedVersion = (lock: typeof Lockfile.Type, name: string): string => {
  const resolved = lock.packages[name]?.[0];

  if (resolved?.startsWith(`${name}@`) !== true)
    throw new Error(`Missing ${name} in the bun.lock package list`);

  return resolved.slice(name.length + 1);
};

export const readPins = async (cwd: string): Promise<Pins> => {
  const lock = decodeLockfile(Bun.JSON5.parse(await Bun.file(join(cwd, "bun.lock")).text()));
  const mise = decodeMiseConfig(Bun.TOML.parse(await Bun.file(join(cwd, "mise.toml")).text()));
  const packages = new Map<string, Pin>();

  for (const [workspace, manifest] of Object.entries(lock.workspaces)) {
    const declared = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
      ...manifest.optionalDependencies,
    };

    for (const [name, range] of Object.entries(declared)) {
      if (range.startsWith("workspace:") || packages.has(name)) continue;
      packages.set(name, { version: resolvedVersion(lock, name), workspace });
    }
  }

  return { packages, tools: new Map(Object.entries(mise.tools ?? {})) };
};

export const pinnedVersion = (source: Source, pins: Pins): string | undefined =>
  source.versionSource === "mise"
    ? pins.tools.get(source.package)
    : pins.packages.get(source.package)?.version;

/** Every name the manifest must cover. */
export const pinnedNames = (pins: Pins): readonly string[] => [
  ...pins.packages.keys(),
  ...pins.tools.keys(),
];

/** Walks up from `from` through `node_modules` folders, as Node resolution does. */
const findPackage = (name: string, from: string): string | undefined => {
  const candidate = join(from, "node_modules", name);
  if (existsSync(candidate)) return candidate;

  const parent = dirname(from);

  return parent === from ? undefined : findPackage(name, parent);
};

/** The folder a dependency is installed in, as seen from the workspace that declares it. */
export const packageFolder = (cwd: string, pins: Pins, name: string): string => {
  const pin = pins.packages.get(name);
  const folder = pin === undefined ? undefined : findPackage(name, join(cwd, pin.workspace));
  if (folder === undefined) throw new Error(`${name} is not installed; run \`bun install\``);

  return folder;
};

/** The file or folder an API pointer names, following `package` from the source's real folder. */
export const apiPath = (cwd: string, pins: Pins, source: Source, pointer: ApiPointer): string => {
  const sourceFolder = packageFolder(cwd, pins, source.package);
  if (pointer.package === undefined) return join(sourceFolder, pointer.path);

  const folder = findPackage(pointer.package, realpathSync(sourceFolder));

  if (folder === undefined)
    throw new Error(`${pointer.package} is not installed with ${source.package}`);

  return join(folder, pointer.path);
};
