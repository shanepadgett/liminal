/** Diffs and reminders the harness writes into requests. */

import { expect, test } from "bun:test";

import { reminder, unifiedDiff } from "../src/core/text.ts";

test("a diff is hunks with two lines of context and no headers", () => {
  const before = "a\nb\nc\nd\ne\nf\ng\n";
  const after = "a\nb\nc\nd\nE\nf\ng\n";

  expect(unifiedDiff(before, after)).toBe("@@ -3,5 +3,5 @@\n c\n d\n-e\n+E\n f\n g");
});

test("a reminder wraps its text in a tagged block", () => {
  expect(reminder("tools", "x")).toBe('<reminder kind="tools">\nx\n</reminder>');
});
