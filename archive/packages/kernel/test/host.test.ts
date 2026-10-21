/**
 * Boots fixture plugins written to a temp folder, one per InactiveReason. A server that must not
 * load throws on import, so loading it early would show as ImportFailed instead.
 */

import { describe, expect } from "bun:test";

import { Effect, FileSystem, Path, Predicate } from "effect";

import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { InactiveReason, type PluginStatus, start } from "../src/index.ts";
import { testBoot } from "./support/boot.ts";

const tagNames = ["A", "B", "C", "D", "E", "F", "G", "H", "Z"];

interface FixturePlugin {
  readonly name: string;
  readonly provides?: ReadonlyArray<string>;
  readonly requires?: ReadonlyArray<string>;
  readonly enabled?: boolean;
  /** Builds its provided services, fails while building, or throws when imported. */
  readonly server: "builds" | "fails" | "throws";
}

const tagsSource = [
  `import { Context } from "effect";`,
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
    `import { Effect, Layer } from "effect";`,
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
  { name: "competing-a", provides: ["C"], server: "builds" },
  { name: "competing-b", provides: ["C"], server: "throws" },
  { name: "replaced", provides: ["G"], server: "throws" },
  { name: "replacer", provides: ["G"], server: "builds" },
  { name: "chosen-1", provides: ["H"], server: "throws" },
  { name: "chosen-2", provides: ["H"], server: "throws" },
  { name: "turned-off", server: "throws" },
  { name: "turned-on", enabled: false, server: "builds" },
  { name: "cycle-1", provides: ["D"], requires: ["E"], server: "throws" },
  { name: "cycle-2", provides: ["E"], requires: ["D"], server: "throws" },
  { name: "import-fails", server: "throws" },
  { name: "build-fails", provides: ["F"], server: "fails" },
  { name: "needs-build-fails", requires: ["F"], server: "builds" },
];

/** The user's choices in `plugins.json`. */
const choices = new Map([
  ["replacer", true],
  ["chosen-1", true],
  ["chosen-2", true],
  ["turned-off", false],
  ["turned-on", true],
]);

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

describe("start", () => {
  effectTest(
    "activates what resolves and builds, and gives every other plugin its reason",
    Effect.gen(function* () {
      const folder = yield* writeFixtures;
      const kernel = yield* start(testBoot([folder], choices));
      const status = yield* kernel.status;
      const reasons = reasonsOf(status);

      const active = status.flatMap((plugin) =>
        Predicate.isTagged(plugin, "Active") ? [plugin.name] : [],
      );

      expect(active.toSorted()).toEqual(["competing-a", "needs-ok", "ok", "replacer", "turned-on"]);
      expect(reasons.size).toBe(plugins.length - 4);
      expect(reasons.get("disabled")).toEqual(InactiveReason.Disabled({ by: "default" }));
      expect(reasons.get("turned-off")).toEqual(InactiveReason.Disabled({ by: "choice" }));

      expect(reasons.get("competing-b")).toEqual(
        InactiveReason.Competing({ service: "fixture/C", active: "competing-a" }),
      );

      expect(reasons.get("replaced")).toEqual(
        InactiveReason.Replaced({ service: "fixture/G", by: "replacer" }),
      );

      expect(reasons.get("missing")).toEqual(
        InactiveReason.MissingService({ service: "fixture/Z" }),
      );

      expect(reasons.get("needs-missing")).toEqual(
        InactiveReason.DependencyInactive({ plugin: "missing" }),
      );

      expect(reasons.get("needs-build-fails")).toEqual(
        InactiveReason.DependencyInactive({ plugin: "build-fails" }),
      );

      for (const name of ["chosen-1", "chosen-2"]) {
        expect(reasons.get(name)).toEqual(
          InactiveReason.DuplicateProvider({
            service: "fixture/H",
            plugins: ["chosen-1", "chosen-2"],
          }),
        );
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
      const kernel = yield* start(testBoot(["/nonexistent/liminal-plugins"]));
      expect(yield* kernel.status).toEqual([]);
    }),
    testBaseServices,
  );
});
