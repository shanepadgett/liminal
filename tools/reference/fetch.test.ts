import assert from "node:assert/strict";
import { test } from "node:test";

import { relativePath } from "./fetch.ts";

void test("relative documentation paths pass through", () => {
  assert.equal(relativePath("docs/**/*.md"), "docs/**/*.md");
});

void test("paths that escape the package are rejected", () => {
  for (const path of [
    "",
    "/etc/passwd",
    "../x.md",
    "a/../b.md",
    "a//b.md",
    ".git/config",
    "a\\b.md",
  ])
    assert.throws(() => relativePath(path), /Expected a relative documentation path/u);
});
