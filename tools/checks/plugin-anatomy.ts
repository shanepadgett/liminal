/**
 * Checks every package under packages/plugins/ has the plugin anatomy: plugin.ts, src/contract.ts,
 * test/, exports limited to the manifest, contract and an optional conformance suite, host-supplied
 * packages as peers, and no kernel.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import { jsonReader, type Problem, report } from "./problem.ts";

const requiredExports = { ".": "./plugin.ts", "./contract": "./src/contract.ts" };
const allowedSrcEntries = new Set(["contract.ts", "server.ts", "server", "tui.tsx", "tui"]);

const hostPeers = new Set([
  "@liminal/sdk",
  "effect",
  "@opentui/core",
  "@opentui/solid",
  "solid-js",
]);

const Dependencies = Schema.optional(Schema.Record(Schema.String, Schema.String));

const Manifest = Schema.Struct({
  exports: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  dependencies: Dependencies,
  devDependencies: Dependencies,
  peerDependencies: Dependencies,
  optionalDependencies: Dependencies,
});

type Manifest = typeof Manifest.Type;

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

const readManifest = jsonReader(Manifest);

const conformanceExport = { "./conformance": "./test/conformance.ts" };

const checkExports = (dir: string, manifest: Manifest): Problem[] => {
  const path = join(dir, "package.json");
  const { "./conformance": conformance, ...rest } = manifest.exports ?? {};

  if (JSON.stringify(rest) !== JSON.stringify(requiredExports)) {
    const allowed = `${JSON.stringify(requiredExports)} and optionally ${JSON.stringify(conformanceExport)}`;

    return [{ path, message: `exports must be exactly ${allowed}` }];
  }

  if (conformance === undefined) return [];

  if (conformance !== conformanceExport["./conformance"])
    return [{ path, message: `./conformance must point to ./test/conformance.ts` }];

  if (!existsSync(join(dir, "test/conformance.ts")))
    return [{ path: join(dir, "test/conformance.ts"), message: "exported but missing" }];

  return [];
};

const checkDependencies = (dir: string, manifest: Manifest): Problem[] => {
  const path = join(dir, "package.json");
  const problems: Problem[] = [];

  for (const field of dependencyFields) {
    const names = Object.keys(manifest[field] ?? {});

    if (names.includes("@liminal/kernel")) {
      problems.push({ path, message: `${field} cannot include @liminal/kernel` });
    }

    if (field !== "dependencies") continue;

    for (const name of names) {
      if (!hostPeers.has(name)) continue;

      problems.push({
        path,
        message: `${name} is supplied by the host; declare it in peerDependencies`,
      });
    }
  }

  return problems;
};

const checkFiles = (dir: string): Problem[] => {
  const problems: Problem[] = [];

  for (const required of ["plugin.ts", "src/contract.ts"]) {
    if (!existsSync(join(dir, required)))
      problems.push({ path: join(dir, required), message: "missing" });
  }

  const testDir = join(dir, "test");

  if (!existsSync(testDir) || !statSync(testDir).isDirectory()) {
    problems.push({ path: testDir, message: "missing test directory" });
  }

  const srcDir = join(dir, "src");
  const entries = existsSync(srcDir) ? readdirSync(srcDir) : [];

  for (const entry of entries) {
    if (allowedSrcEntries.has(entry)) continue;

    problems.push({
      path: join(srcDir, entry),
      message: "src/ holds only contract.ts, server.ts or server/, tui.tsx or tui/",
    });
  }

  return problems;
};

const checkPlugin = (dir: string): Problem[] => {
  const manifest = readManifest(join(dir, "package.json"));

  if (manifest === undefined)
    return [{ path: join(dir, "package.json"), message: "missing or invalid" }];

  return checkFiles(dir).concat(checkExports(dir, manifest), checkDependencies(dir, manifest));
};

/** Every anatomy problem in the plugins directory under `root`. */
export const checkPlugins = (root: string): Problem[] => {
  const pluginsDir = join(root, "packages", "plugins");
  if (!existsSync(pluginsDir)) return [];

  return readdirSync(pluginsDir).flatMap((name) => {
    const dir = join(pluginsDir, name);

    return statSync(dir).isDirectory() ? checkPlugin(dir) : [];
  });
};

if (import.meta.main) report(checkPlugins(process.cwd()));
