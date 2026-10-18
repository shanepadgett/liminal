/**
 * A plugin package outside the host's folder imports another package's contract by name: it gets
 * the files the host loaded that package from, never a copy installed beside it. A second package
 * with a taken name does not load.
 */

import { expect } from "bun:test";

import { Cause, Context, Effect, FileSystem, Path } from "effect";

import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { InactiveReason, PluginStatus, start } from "../src/index.ts";
import { testBoot } from "./support/boot.ts";

/** The outside plugin's service: where the owner's contract it imported came from. */
class Heard extends Context.Service<Heard, { readonly origin: string }>()("acme/Heard") {}

const ownerJson = JSON.stringify({
  name: "@acme/owner",
  exports: { ".": "./plugin.ts", "./contract": "./contract.ts" },
  liminal: ["./plugin.ts"],
});

const ownerFiles = (origin: string) => ({
  "package.json": ownerJson,
  "contract.ts": [
    'import { Context } from "effect";',
    'export class Word extends Context.Service<Word, {}>()("acme/Word") {}',
    `export const origin = ${JSON.stringify(origin)};`,
  ].join("\n"),
  "plugin.ts": [
    'import { Word } from "./contract.ts";',
    'export default { name: "owner", provides: [Word], requires: [], uses: [], enabledByDefault: true,',
    '  server: () => import("./server.ts") };',
  ].join("\n"),
  "server.ts": [
    'import { Layer } from "effect";',
    'import { Word } from "./contract.ts";',
    "export const layer = Layer.succeed(Word, {});",
  ].join("\n"),
});

const userFiles = {
  "package.json": JSON.stringify({
    name: "@acme/user",
    peerDependencies: { "@acme/owner": "*" },
    liminal: ["./plugin.ts"],
  }),
  "plugin.ts": [
    'import { Context } from "effect";',
    'import { Word } from "@acme/owner/contract";',
    'export class Heard extends Context.Service<Heard, {}>()("acme/Heard") {}',
    'export default { name: "user", provides: [Heard], requires: [Word], uses: [],',
    '  enabledByDefault: true, server: () => import("./server.ts") };',
  ].join("\n"),
  "server.ts": [
    'import { Layer } from "effect";',
    'import { origin } from "@acme/owner/contract";',
    'import { Heard } from "./plugin.ts";',
    "export const layer = Layer.succeed(Heard, { origin });",
  ].join("\n"),
  "node_modules/@acme/owner/package.json": ownerJson,
  "node_modules/@acme/owner/contract.ts": 'throw new Error("the own copy loaded");',
};

const writeFiles = Effect.fn("writeFiles")(function* (
  dir: string,
  files: Readonly<Record<string, string>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    yield* fs.makeDirectory(path.dirname(file), { recursive: true });
    yield* fs.writeFileString(file, text);
  }
});

effectTest(
  "an outside plugin gets the host's contract, and a taken package name does not load",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-contracts-" });
    const host = path.join(root, "host");
    const outside = path.join(root, "outside");
    const late = path.join(root, "late");
    yield* writeFiles(path.join(host, "owner"), ownerFiles("host"));
    yield* writeFiles(path.join(outside, "user"), userFiles);
    yield* writeFiles(path.join(late, "owner"), ownerFiles("late"));

    const kernel = yield* start(testBoot([host, outside, late]));

    const heard = yield* kernel.use((services) =>
      Effect.succeed(Context.getUnsafe(services, Heard).origin),
    );

    expect(heard).toBe("host");

    const why = (yield* kernel.status).flatMap((status) =>
      PluginStatus.$is("Inactive")(status) && InactiveReason.$is("ImportFailed")(status.reason)
        ? [`${status.name}: ${Cause.pretty(status.reason.cause)}`]
        : [],
    );

    expect(why).toHaveLength(1);
    expect(why[0]).toStartWith(path.join(late, "owner"));
    expect(why[0]).toContain("PackageNameTaken");
  }),
  testBaseServices,
);
