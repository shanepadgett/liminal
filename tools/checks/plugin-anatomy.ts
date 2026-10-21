/**
 * Checks every package under packages/plugins/ has the plugin anatomy: named after its folder,
 * published, exports limited to the plugin, contract, tui and web entries, the plugin entry listed
 * under `liminal.plugins`, and host-supplied packages and other plugins as peers.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import { jsonReader, type Problem, report } from "./problem.ts";

/** Each export a plugin may have, and the file it must point to. */
const entryFiles = new Map([
  [".", "./src/plugin.ts"],
  ["./contract", "./src/contract.ts"],
  ["./tui", "./src/tui.tsx"],
  ["./web", "./src/web.tsx"],
]);

const allowedSrcEntries = new Set([
  "contract.ts",
  "plugin.ts",
  "plugin",
  "tui.tsx",
  "tui",
  "web.tsx",
  "web",
]);

const Dependencies = Schema.optional(Schema.Record(Schema.String, Schema.String));

const Manifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  private: Schema.optional(Schema.Boolean),
  exports: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  liminal: Schema.optional(Schema.Struct({ plugins: Schema.Array(Schema.String) })),
  dependencies: Dependencies,
  optionalDependencies: Dependencies,
});

type Manifest = typeof Manifest.Type;

const readManifest = jsonReader(Manifest);

const checkExports = (dir: string, manifest: Manifest): Problem[] => {
  const path = join(dir, "package.json");
  const exports = Object.entries(manifest.exports ?? {});
  const problems: Problem[] = [];

  if (!exports.some(([key]) => key === "."))
    problems.push({ path, message: `exports must include "." pointing to ./src/plugin.ts` });

  for (const [key, target] of exports) {
    const expected = entryFiles.get(key);

    if (expected === undefined) {
      const allowed = [...entryFiles.keys()].join(", ");
      problems.push({ path, message: `export "${key}" is not one of ${allowed}` });
    } else if (target !== expected) {
      problems.push({ path, message: `export "${key}" must point to ${expected}` });
    } else if (!existsSync(join(dir, expected))) {
      problems.push({ path: join(dir, expected), message: "exported but missing" });
    }
  }

  return problems;
};

const checkIdentity = (dir: string, name: string, manifest: Manifest): Problem[] => {
  const path = join(dir, "package.json");
  const problems: Problem[] = [];

  if (manifest.name !== `@shanepadgett/liminal-${name}`)
    problems.push({
      path,
      message: `name must be @shanepadgett/liminal-${name}, after its folder`,
    });

  if (manifest.private === true)
    problems.push({ path, message: "plugin packages are published; remove private" });

  if (JSON.stringify(manifest.liminal?.plugins) !== JSON.stringify(["./src/plugin.ts"]))
    problems.push({ path, message: `liminal.plugins must be ["./src/plugin.ts"]` });

  return problems;
};

/** Packages the host supplies, so a plugin declares them as peers instead of installing them. */
const isHostSupplied = (name: string) =>
  name === "effect"
  || name === "solid-js"
  || name.startsWith("@opentui/")
  || name.startsWith("@shanepadgett/liminal-");

const checkDependencies = (dir: string, manifest: Manifest): Problem[] => {
  const path = join(dir, "package.json");
  const installed = { ...manifest.dependencies, ...manifest.optionalDependencies };

  return Object.keys(installed).flatMap((name) =>
    isHostSupplied(name)
      ? [{ path, message: `${name} is supplied by the host; declare it in peerDependencies` }]
      : [],
  );
};

const srcLayout =
  "src/ holds only contract.ts, plugin.ts or plugin/, tui.tsx or tui/, web.tsx or web/";

const checkSrc = (dir: string): Problem[] => {
  const srcDir = join(dir, "src");
  const entries = existsSync(srcDir) ? readdirSync(srcDir) : [];

  return entries.flatMap((entry) =>
    allowedSrcEntries.has(entry) ? [] : [{ path: join(srcDir, entry), message: srcLayout }],
  );
};

const checkPlugin = (dir: string, name: string): Problem[] => {
  const manifest = readManifest(join(dir, "package.json"));

  if (manifest === undefined)
    return [{ path: join(dir, "package.json"), message: "missing or invalid" }];

  return checkIdentity(dir, name, manifest).concat(
    checkExports(dir, manifest),
    checkDependencies(dir, manifest),
    checkSrc(dir),
  );
};

/** Every anatomy problem in the plugins directory under `root`. */
export const checkPlugins = (root: string): Problem[] => {
  const pluginsDir = join(root, "packages", "plugins");
  if (!existsSync(pluginsDir)) return [];

  return readdirSync(pluginsDir).flatMap((name) => {
    const dir = join(pluginsDir, name);

    return statSync(dir).isDirectory() ? checkPlugin(dir, name) : [];
  });
};

if (import.meta.main) report(checkPlugins(process.cwd()));
