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

  expect(messages.toSorted()).toEqual([
    "broken/packages/plugins/demo/package.json: @liminal/sdk is supplied by the host; declare it in peerDependencies",
    "broken/packages/plugins/demo/package.json: dependencies cannot include @liminal/kernel",
    'broken/packages/plugins/demo/package.json: exports must be exactly {".":"./plugin.ts","./contract":"./src/contract.ts"} and optionally {"./conformance":"./test/conformance.ts"}',
    "broken/packages/plugins/demo/src/contract.ts: missing",
    "broken/packages/plugins/demo/src/helpers.ts: src/ holds only contract.ts, server.ts or server/, tui.tsx or tui/",
    "broken/packages/plugins/demo/test: missing test directory",
    "broken/packages/plugins/suite/test/conformance.ts: exported but missing",
  ]);
});
