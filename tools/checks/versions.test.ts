import { expect, test } from "bun:test";
import { join } from "node:path";

import { checkVersions } from "./versions.ts";

const fixtures = join(import.meta.dirname, "fixtures", "versions");

const messages = (root: string) =>
  checkVersions(root).map(
    (problem) => `${problem.path.slice(root.length + 1)}: ${problem.message}`,
  );

test("packages sharing the root version pass", () => {
  expect(checkVersions(join(fixtures, "same"))).toEqual([]);
});

test("each package with another version is reported", () => {
  expect(messages(join(fixtures, "mixed"))).toEqual([
    "packages/kernel/package.json: version 0.2.0, expected 0.1.0",
    "packages/plugins/demo/package.json: version missing, expected 0.1.0",
  ]);
});

test("a root without a version is reported", () => {
  expect(messages(join(fixtures, "unversioned"))).toEqual(["package.json: missing version"]);
});
