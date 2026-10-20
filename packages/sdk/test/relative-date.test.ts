/** Explicit reference times make relative-date thresholds and local calendar labels deterministic. */

import { expect, test } from "bun:test";

import { DateTime } from "effect";

import { formatRelativeDate } from "../src/tui/relative-date.ts";

const now = DateTime.makeUnsafe(new Date(2026, 9, 20, 12));
const atAge = (millis: number) => DateTime.makeUnsafe(DateTime.toEpochMillis(now) - millis);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const cases: ReadonlyArray<readonly [number, string]> = [
  [-MINUTE, "just now"],
  [0, "just now"],
  [MINUTE - 1, "just now"],
  [MINUTE, "1 minute ago"],
  [12 * MINUTE, "12 minutes ago"],
  [HOUR - 1, "59 minutes ago"],
  [HOUR, "1 hour ago"],
  [2 * HOUR, "2 hours ago"],
  [DAY - 1, "23 hours ago"],
  [DAY, "1 day ago"],
  [3 * DAY, "3 days ago"],
  [7 * DAY - 1, "6 days ago"],
  [7 * DAY, "Oct 13"],
];

for (const [age, expected] of cases) {
  test(`date age ${age} milliseconds is ${expected}`, () => {
    expect(formatRelativeDate(atAge(age), now)).toBe(expected);
  });
}

const local = (year: number, month: number, day: number) =>
  DateTime.makeUnsafe(new Date(year, month - 1, day, 0, 15));

test("calendar labels use local dates and include a year only outside the reference year", () => {
  expect(formatRelativeDate(local(2026, 10, 1), now)).toBe("Oct 1");
  expect(formatRelativeDate(local(2025, 10, 17), now)).toBe("Oct 17, 2025");
  expect(formatRelativeDate(local(2025, 12, 24), local(2026, 1, 1))).toBe("Dec 24, 2025");
});
