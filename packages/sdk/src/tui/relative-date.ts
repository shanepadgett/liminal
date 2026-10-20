/** Date labels use explicit reference time, elapsed units, and the machine's local calendar. */

import { DateTime } from "effect";

const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const yearOf = (date: DateTime.Utc) =>
  DateTime.formatLocal(date, { year: "numeric", locale: "en" });

export const formatRelativeDate = (at: DateTime.Utc, now: DateTime.Utc): string => {
  const elapsed = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(at);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return relative.format(-Math.floor(elapsed / DAY), "day");

  return DateTime.formatLocal(at, {
    locale: "en",
    month: "short",
    day: "numeric",
    year: yearOf(at) === yearOf(now) ? undefined : "numeric",
  });
};
