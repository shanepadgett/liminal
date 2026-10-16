import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { checkPlugins } from "./plugin-anatomy.ts";

const fixtures = join(import.meta.dirname, "fixtures");

void test("a plugin with the full anatomy passes", () => {
  assert.deepEqual(checkPlugins(join(fixtures, "good")), []);
});

void test("a broken plugin reports each anatomy problem", () => {
  const messages = checkPlugins(join(fixtures, "broken")).map(
    (problem) => `${problem.path.slice(fixtures.length + 1)}: ${problem.message}`,
  );

  assert.deepEqual(messages.toSorted(), [
    "broken/plugins/demo/package.json: @liminal/sdk is supplied by the host; declare it in peerDependencies",
    "broken/plugins/demo/package.json: dependencies cannot include @liminal/kernel",
    'broken/plugins/demo/package.json: exports must be exactly {".":"./plugin.ts","./contract":"./src/contract.ts"}',
    "broken/plugins/demo/src/contract.ts: missing",
    "broken/plugins/demo/src/helpers.ts: src/ holds only contract.ts, server.ts or server/, tui.tsx or tui/",
    "broken/plugins/demo/test: missing test directory",
  ]);
});
