/**
 * Checks every workspace package has the root package's version: Liminal's packages release
 * together under one shared version.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import { jsonReader, type Problem, report } from "./problem.ts";

const Manifest = Schema.Struct({
  version: Schema.optional(Schema.String),
  workspaces: Schema.optional(Schema.Array(Schema.String)),
});

const readManifest = jsonReader(Manifest);

/** Package folders a workspace pattern names: `dir` itself, or each child of `dir/*`. */
const packageDirs = (root: string, pattern: string): string[] => {
  if (!pattern.endsWith("/*")) return [join(root, pattern)];

  const parent = join(root, pattern.slice(0, -2));
  if (!existsSync(parent)) return [];

  return readdirSync(parent, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? [join(parent, entry.name)] : [],
  );
};

const checkPackage = (dir: string, version: string): Problem[] => {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return [];

  const found = readManifest(path)?.version;

  return found === version
    ? []
    : [{ path, message: `version ${found ?? "missing"}, expected ${version}` }];
};

/** Every workspace package under `root` whose version differs from the root package's. */
export const checkVersions = (root: string): Problem[] => {
  const path = join(root, "package.json");
  const manifest = readManifest(path);

  if (manifest?.version === undefined) return [{ path, message: "missing version" }];

  const { version } = manifest;

  return (manifest.workspaces ?? [])
    .flatMap((pattern) => packageDirs(root, pattern))
    .flatMap((dir) => checkPackage(dir, version));
};

if (import.meta.main) report(checkVersions(process.cwd()));
