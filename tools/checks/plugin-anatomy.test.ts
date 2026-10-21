import { expect, test } from "bun:test";
import { join } from "node:path";

import { checkPlugins } from "./plugin-anatomy.ts";

const fixtures = join(import.meta.dirname, "fixtures");

test("a plugin with the full anatomy passes", () => {
  expect(checkPlugins(join(fixtures, "good"))).toEqual([]);
});

test("a broken plugin reports each anatomy problem", () => {
  const messages = checkPlugins(join(fixtures, "broken")).map(
    (problem) => `${problem.path.slice(fixtures.length + 1)}: ${problem.message}`,
  );

  const demo = "broken/packages/plugins/demo";

  expect(messages.toSorted()).toEqual([
    `${demo}/package.json: @shanepadgett/liminal-core is supplied by the host; declare it in peerDependencies`,
    `${demo}/package.json: effect is supplied by the host; declare it in peerDependencies`,
    `${demo}/package.json: export "./server" is not one of ., ./contract, ./tui, ./web`,
    `${demo}/package.json: export "./web" must point to ./src/web.tsx`,
    `${demo}/package.json: exports must include "." pointing to ./src/index.ts`,
    `${demo}/package.json: liminal.plugins must be ["./src/index.ts"]`,
    `${demo}/package.json: name must be @shanepadgett/liminal-demo, after its folder`,
    `${demo}/package.json: plugin packages are published; remove private`,
    "broken/packages/plugins/missing/src/tui.tsx: exported but missing",
  ]);
});
