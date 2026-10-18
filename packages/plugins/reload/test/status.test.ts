/** The header item's failure reason: its first line, cut to fit the header. */

import { expect, test } from "bun:test";

import { shortReason } from "../src/tui/ReloadStatus.tsx";

test("a failure reason shows its first line", () => {
  expect(shortReason("\nsrc/a.ts(1,1): error TS2322\nsrc/b.ts(2,2): error TS2345\n")).toBe(
    "src/a.ts(1,1): error TS2322",
  );
});

test("a long failure reason is cut to fit the header", () => {
  const shown = shortReason("x".repeat(100));

  expect(shown).toHaveLength(48);
  expect(shown.endsWith("…")).toBe(true);
});
