import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { checkVersions } from "./versions.ts";

const fixtures = join(import.meta.dirname, "fixtures", "versions");

const messages = (root: string) =>
  checkVersions(root).map(
    (problem) => `${problem.path.slice(root.length + 1)}: ${problem.message}`,
  );

void test("packages sharing the root version pass", () => {
  assert.deepEqual(checkVersions(join(fixtures, "same")), []);
});

void test("each package with another version is reported", () => {
  assert.deepEqual(messages(join(fixtures, "mixed")), [
    "packages/kernel/package.json: version 0.2.0, expected 0.1.0",
    "packages/plugins/demo/package.json: version missing, expected 0.1.0",
  ]);
});

void test("a root without a version is reported", () => {
  assert.deepEqual(messages(join(fixtures, "unversioned")), ["package.json: missing version"]);
});
