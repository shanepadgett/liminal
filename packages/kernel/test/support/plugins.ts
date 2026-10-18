/**
 * Writes the swap fixture plugins to a temp folder and starts a kernel over them: `source`,
 * `reader` and `steady` from `swap.ts`, and `fresh`, whose value comes from its own `value.ts`.
 */

import { Context, Effect, FileSystem, Path, Queue, Stream } from "effect";

import type { GraphMember } from "@liminal/sdk";

import type { ReloadOptions } from "../../src/index.ts";
import { start } from "../../src/index.ts";
import { testBoot, testReload } from "./boot.ts";
import { Fresh, Reader, Source, sourceFile, Steady } from "./swap.ts";

const swapUrl = import.meta.resolve("./swap.ts");

const manifest = (name: string, provides: string, requires: string, server: string) =>
  [
    `import { Fresh, Reader, Source, Steady } from "${swapUrl}";`,
    "export default {",
    `  name: "${name}",`,
    `  provides: [${provides}],`,
    `  requires: [${requires}],`,
    "  uses: [],",
    "  enabledByDefault: true,",
    `  server: () => ${server},`,
    "};",
  ].join("\n");

const fromSwap = (layer: string) =>
  `import("${swapUrl}").then((module) => ({ layer: module.${layer} }))`;

const plugins = [
  ["source", "Source", "", fromSwap("sourceLayer")],
  ["reader", "Reader", "Source", fromSwap("readerLayer")],
  ["steady", "Steady", "", fromSwap("steadyLayer")],
  ["fresh", "Fresh", "", 'import("./server.ts")'],
] as const;

const freshServer = [
  'import { Layer } from "effect";',
  `import { Fresh } from "${swapUrl}";`,
  'import { value } from "./value.ts";',
  "export const layer = Layer.succeed(Fresh, { value });",
].join("\n");

/** Sets the value `source` reads when it next builds; `fail` makes the build fail. */
export const writeSource = (value: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(yield* sourceFile, value);
  });

const writePlugins = Effect.fn("writePlugins")(function* (folder: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  for (const [name, provides, requires, server] of plugins) {
    const dir = path.join(folder, name);
    yield* fs.makeDirectory(dir);
    yield* fs.writeFileString(path.join(dir, "package.json"), '{ "liminal": ["./plugin.ts"] }');

    yield* fs.writeFileString(
      path.join(dir, "plugin.ts"),
      manifest(name, provides, requires, server),
    );
  }

  yield* fs.writeFileString(path.join(folder, "fresh", "server.ts"), freshServer);
});

/** Sets the value in `fresh`'s own `value.ts`. */
export const writeFresh = Effect.fn("writeFresh")(function* (folder: string, value: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(folder, "fresh", "value.ts");
  yield* fs.writeFileString(file, `export const value = ${JSON.stringify(value)};`);

  return file;
});

/**
 * A kernel over the fixture plugins, with `source` and `fresh` reading "one", and reloads fed by
 * `changes` with the given overrides.
 */
export const started = Effect.fn("started")(function* (
  overrides: Partial<Omit<ReloadOptions, "changes">> = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-graphs-" });
  yield* writePlugins(folder);
  yield* writeSource("one");
  yield* writeFresh(folder, "one");
  const { reload, changes } = yield* testReload(overrides);
  const kernel = yield* start({ ...testBoot([folder]), reload });

  /** Reports a change to the files of plugin package `name`. */
  const touch = (name: string) =>
    Queue.offer(changes, [path.join(folder, name, "plugin.ts")]).pipe(Effect.asVoid);

  return { kernel, folder, changes, touch };
});

export type Started = Effect.Success<ReturnType<typeof started>>;

/** The current graph's fixture services. */
export const current = ({ kernel }: Started) =>
  kernel.use((services) =>
    Effect.succeed({
      source: Context.getUnsafe(services, Source),
      reader: Context.getUnsafe(services, Reader),
      steady: Context.getUnsafe(services, Steady),
      fresh: Context.getUnsafe(services, Fresh),
    }),
  );

const buildOf = (members: ReadonlyArray<GraphMember>, name: string) =>
  members.find((member) => member.name === name)?.build;

/** Runs `trigger`, then waits for a graph that rebuilt plugin `name`. */
export const rebuilt = Effect.fn("rebuilt")(function* (
  { kernel }: Started,
  name: string,
  trigger: Effect.Effect<void>,
) {
  const first = yield* Stream.runHead(kernel.graph).pipe(Effect.flatMap(Effect.fromOption));
  const before = buildOf(first, name);
  yield* trigger;

  yield* kernel.graph.pipe(
    Stream.filter((members) => buildOf(members, name) !== before),
    Stream.runHead,
  );
});
