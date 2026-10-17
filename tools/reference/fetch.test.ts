import { expect, test } from "bun:test";

import { relativePath } from "./fetch.ts";

test("relative documentation paths pass through", () => {
  expect(relativePath("docs/**/*.md")).toBe("docs/**/*.md");
});

test("paths that escape the package are rejected", () => {
  for (const path of [
    "",
    "/etc/passwd",
    "../x.md",
    "a/../b.md",
    "a//b.md",
    ".git/config",
    "a\\b.md",
  ])
    expect(() => relativePath(path)).toThrow(/Expected a relative documentation path/u);
});
