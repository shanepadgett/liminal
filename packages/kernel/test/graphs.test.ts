/**
 * Graph changes over fixture plugins: a change rebuilds the named plugin and its dependents beside
 * the running graph, work in flight keeps the graph it started on, and a broken change keeps the
 * current graph.
 */

import { describe, expect } from "bun:test";

import {
  Context,
  Deferred,
  Effect,
  Exit,
  FileSystem,
  Fiber,
  Option,
  Path,
  Predicate,
} from "effect";

import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { ChangeFailed, start } from "../src/index.ts";
import { closed, Reader, Source, sourceFile, Steady } from "./support/swap.ts";

const swapUrl = import.meta.resolve("./support/swap.ts");

const manifest = (name: string, provides: string, requires: string, layer: string) =>
  [
    `import { Reader, Source, Steady } from "${swapUrl}";`,
    "export default {",
    `  name: "${name}",`,
    `  provides: [${provides}],`,
    `  requires: [${requires}],`,
    "  uses: [],",
    "  enabledByDefault: true,",
    `  server: () => import("${swapUrl}").then((module) => ({ layer: module.${layer} })),`,
    "};",
  ].join("\n");

const plugins = [
  ["source", "Source", "", "sourceLayer"],
  ["reader", "Reader", "Source", "readerLayer"],
  ["steady", "Steady", "", "steadyLayer"],
] as const;

const writeSource = (value: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(yield* sourceFile, value);
  });

/** A kernel over the fixture plugins, with `source` reading "one". */
const started = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-graphs-" });

  for (const [name, provides, requires, layer] of plugins) {
    const dir = path.join(folder, name);
    yield* fs.makeDirectory(dir);
    yield* fs.writeFileString(path.join(dir, "package.json"), '{ "liminal": ["./plugin.ts"] }');

    yield* fs.writeFileString(
      path.join(dir, "plugin.ts"),
      manifest(name, provides, requires, layer),
    );
  }

  yield* writeSource("one");

  return yield* start({ folders: [folder] });
});

type Kernel = Effect.Success<typeof started>;

/** The current graph's fixture services. */
const current = (kernel: Kernel) =>
  kernel.use((services) =>
    Effect.succeed({
      source: Context.getUnsafe(services, Source),
      reader: Context.getUnsafe(services, Reader),
      steady: Context.getUnsafe(services, Steady),
    }),
  );

describe("graph changes", () => {
  effectTest(
    "a change rebuilds the named plugin and its dependents and keeps the rest",
    Effect.gen(function* () {
      const kernel = yield* started;
      const before = yield* current(kernel);
      yield* writeSource("two");
      yield* kernel.reload(["source"]);
      const after = yield* current(kernel);

      expect([after.source.value, after.reader.value]).toEqual(["two", "two"]);
      expect(after.source.id).not.toBe(before.source.id);
      expect(after.reader.id).not.toBe(before.reader.id);
      expect(after.steady.id).toBe(before.steady.id);
      expect([before.source.id, before.reader.id].every((id) => closed.has(id))).toBe(true);
      expect(closed.has(before.steady.id)).toBe(false);
    }),
    testBaseServices,
  );

  effectTest(
    "work in flight keeps the graph it started on until it ends",
    Effect.gen(function* () {
      const kernel = yield* started;
      const before = yield* current(kernel);
      const holding = yield* Deferred.make<void>();
      const gate = yield* Deferred.make<void>();

      const step = yield* kernel
        .use((services) =>
          Deferred.done(holding, Exit.void).pipe(
            Effect.andThen(Deferred.await(gate)),
            Effect.as(Context.getUnsafe(services, Reader)),
          ),
        )
        .pipe(Effect.forkChild);

      yield* Deferred.await(holding);
      yield* writeSource("two");
      yield* kernel.reload(["source"]);

      expect((yield* current(kernel)).reader.value).toBe("two");
      expect(closed.has(before.reader.id)).toBe(false);
      yield* Deferred.done(gate, Exit.void);
      const old = yield* Fiber.join(step);

      expect([old.id, old.value]).toEqual([before.reader.id, "one"]);
      expect(closed.has(old.id)).toBe(true);
    }),
    testBaseServices,
  );

  effectTest(
    "a change that breaks a plugin keeps the current graph",
    Effect.gen(function* () {
      const kernel = yield* started;
      const before = yield* current(kernel);
      yield* writeSource("fail");
      const exit = yield* Effect.exit(kernel.reload(["source"]));

      expect(Exit.isFailure(exit)).toBe(true);
      const failed = Option.getOrUndefined(Exit.findErrorOption(exit));

      expect(failed instanceof ChangeFailed && failed.failed.map((one) => one.name)).toEqual([
        "source",
      ]);

      const after = yield* current(kernel);
      expect([after.source.id, after.reader.id]).toEqual([before.source.id, before.reader.id]);
      expect(closed.has(before.source.id)).toBe(false);
      const status = yield* kernel.status;
      expect(status.every((plugin) => Predicate.isTagged(plugin, "Active"))).toBe(true);
    }),
    testBaseServices,
  );
});
