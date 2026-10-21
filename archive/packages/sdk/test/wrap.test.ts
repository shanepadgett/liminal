/** Cutting text to one line. */

import { expect, test } from "bun:test";

import { cutLine } from "../src/tui/wrap.ts";

test("a line that fits stays whole, and a longer one is cut at a word with an ellipsis", () => {
  expect(cutLine("git status", 20)).toBe("git status");
  expect(cutLine("git status --short; git log", 20)).toBe("git status --short;…");
  expect(cutLine("anything", 0)).toBe("");
});
