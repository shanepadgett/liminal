/**
 * Boots fixture plugins written to a temp folder, one per InactiveReason. A server that must not
 * load throws on import, so loading it early would show as ImportFailed instead.
 */

import { describe, expect } from "bun:test";

import { Effect, FileSystem, Path, Predicate } from "effect";

import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { boot, InactiveReason, type PluginStatus } from "../src/index.ts";

/** Fixture files import Effect by absolute URL, since the temp folder has no node_modules. */
const effectUrl = import.meta.resolve("effect");

const tagNames = ["A", "B", "C", "D", "E", "F", "Z"];

interface FixturePlugin {
  readonly name: string;
  readonly provides?: ReadonlyArray<string>;
  readonly requires?: ReadonlyArray<string>;
  readonly enabled?: boolean;
  /** Builds its provided services, fails while building, or throws when imported. */
  readonly server: "builds" | "fails" | "throws";
}

const tagsSource = [
  `import { Context } from "${effectUrl}";`,
  ...tagNames.map(
    (tag) => `export class ${tag} extends Context.Service<${tag}, {}>()("fixture/${tag}") {}`,
  ),
].join("\n");

const manifestSource = (plugin: FixturePlugin) =>
  [
    `import { ${tagNames.join(", ")} } from "../tags.ts";`,
    "export default {",
    `  name: "${plugin.name}",`,
    `  provides: [${(plugin.provides ?? []).join(", ")}],`,
    `  requires: [${(plugin.requires ?? []).join(", ")}],`,
    "  uses: [],",
    `  enabledByDefault: ${plugin.enabled ?? true},`,
    '  server: () => import("./server.ts"),',
    "};",
  ].join("\n");

const serverSource = (plugin: FixturePlugin) => {
  if (plugin.server === "throws") return 'throw new Error("server imported early");';

  const layer =
    plugin.server === "fails"
      ? 'Layer.effectDiscard(Effect.fail("boom"))'
      : `Layer.mergeAll(Layer.empty, ${(plugin.provides ?? []).map((tag) => `Layer.succeed(${tag}, {})`).join(", ")})`;

  return [
    `import { Effect, Layer } from "${effectUrl}";`,
    `import { ${tagNames.join(", ")} } from "../tags.ts";`,
    `export const layer = ${layer};`,
  ].join("\n");
};

const plugins: ReadonlyArray<FixturePlugin> = [
  { name: "ok", provides: ["A"], server: "builds" },
  { name: "needs-ok", requires: ["A"], server: "builds" },
  { name: "disabled", enabled: false, server: "throws" },
  { name: "needs-missing", requires: ["B"], server: "throws" },
  { name: "missing", provides: ["B"], requires: ["Z"], server: "throws" },
  { name: "duplicate-1", provides: ["C"], server: "throws" },
  { name: "duplicate-2", provides: ["C"], server: "throws" },
  { name: "cycle-1", provides: ["D"], requires: ["E"], server: "throws" },
  { name: "cycle-2", provides: ["E"], requires: ["D"], server: "throws" },
  { name: "import-fails", server: "throws" },
  { name: "build-fails", provides: ["F"], server: "fails" },
  { name: "needs-build-fails", requires: ["F"], server: "builds" },
];

/** Writes each fixture as a package in a temp folder, plus one whose manifest is missing. */
const writeFixtures = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-host-" });
  yield* fs.writeFileString(path.join(folder, "tags.ts"), tagsSource);

  const writePackage = Effect.fn(function* (name: string, files: Record<string, string>) {
    const dir = path.join(folder, name);
    yield* fs.makeDirectory(dir);

    for (const [file, source] of Object.entries(files))
      yield* fs.writeFileString(path.join(dir, file), source);
  });

  for (const plugin of plugins) {
    yield* writePackage(plugin.name, {
      "package.json": JSON.stringify({ liminal: ["./plugin.ts"] }),
      "plugin.ts": manifestSource(plugin),
      "server.ts": serverSource(plugin),
    });
  }

  yield* writePackage("no-manifest", {
    "package.json": JSON.stringify({ liminal: ["./missing.ts"] }),
  });

  return folder;
});

/** Inactive plugins by name; the plugin whose manifest is missing is named `no-manifest`. */
const reasonsOf = (status: ReadonlyArray<PluginStatus>) =>
  new Map(
    status.flatMap((plugin) =>
      Predicate.isTagged(plugin, "Inactive")
        ? [
            [
              plugin.name.endsWith("missing.ts") ? "no-manifest" : plugin.name,
              plugin.reason,
            ] as const,
          ]
        : [],
    ),
  );

describe("boot", () => {
  effectTest(
    "activates what resolves and builds, and gives every other plugin its reason",
    Effect.gen(function* () {
      const folder = yield* writeFixtures;
      const { status } = yield* boot({ folders: [folder] });
      const reasons = reasonsOf(status);

      const active = status.flatMap((plugin) =>
        Predicate.isTagged(plugin, "Active") ? [plugin.name] : [],
      );

      expect(active.toSorted()).toEqual(["needs-ok", "ok"]);
      expect(reasons.size).toBe(plugins.length - 1);
      expect(reasons.get("disabled")).toEqual(InactiveReason.Disabled());

      expect(reasons.get("missing")).toEqual(
        InactiveReason.MissingService({ service: "fixture/Z" }),
      );

      expect(reasons.get("needs-missing")).toEqual(
        InactiveReason.DependencyInactive({ plugin: "missing" }),
      );

      expect(reasons.get("needs-build-fails")).toEqual(
        InactiveReason.DependencyInactive({ plugin: "build-fails" }),
      );

      for (const name of ["duplicate-1", "duplicate-2"]) {
        const reason = reasons.get(name);
        expect(Predicate.isTagged(reason, "DuplicateProvider") && reason.service).toBe("fixture/C");
      }

      for (const name of ["cycle-1", "cycle-2"]) {
        const reason = reasons.get(name);

        expect(Predicate.isTagged(reason, "Cycle") && reason.plugins.toSorted()).toEqual([
          "cycle-1",
          "cycle-2",
        ]);
      }

      expect(Predicate.isTagged(reasons.get("import-fails"), "ImportFailed")).toBe(true);
      expect(Predicate.isTagged(reasons.get("no-manifest"), "ImportFailed")).toBe(true);
      expect(Predicate.isTagged(reasons.get("build-fails"), "BuildFailed")).toBe(true);
    }),
    testBaseServices,
  );

  effectTest(
    "a missing folder boots nothing",
    Effect.gen(function* () {
      const booted = yield* boot({ folders: ["/nonexistent/liminal-plugins"] });
      expect(booted.status).toEqual([]);
    }),
    testBaseServices,
  );
});
