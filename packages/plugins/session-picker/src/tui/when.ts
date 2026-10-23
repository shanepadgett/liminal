/** When a session was last active, as the list shows it: its section and a short time. */
import { DateTime } from "effect";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const twoDigits = (value: number) => String(value).padStart(2, "0");

const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** How long ago today: `now`, `5m ago`, `2h ago`. */
const agoText = (millis: number) => {
  if (millis < MINUTE) return "now";
  if (millis < HOUR) return `${Math.floor(millis / MINUTE)}m ago`;

  return `${Math.floor(millis / HOUR)}h ago`;
};

export interface When {
  readonly section: "Today" | "Yesterday" | "Earlier";
  readonly detail: string;
}

/** Today's sessions by how long ago, yesterday's by time, older ones by date; all in local time. */
export const whenOf = (at: DateTime.Utc, now: DateTime.Utc): When => {
  const atMillis = DateTime.toEpochMillis(at);
  const nowMillis = DateTime.toEpochMillis(now);
  const local = new Date(atMillis);
  const today = new Date(nowMillis);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  if (atMillis >= midnight) return { section: "Today", detail: agoText(nowMillis - atMillis) };

  if (atMillis >= midnight - DAY) {
    return {
      section: "Yesterday",
      detail: `${twoDigits(local.getHours())}:${twoDigits(local.getMinutes())}`,
    };
  }

  return { section: "Earlier", detail: monthDay.format(local) };
};
