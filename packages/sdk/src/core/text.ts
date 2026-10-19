/** Text the harness writes into a request: line diffs and reminders. */

import { formatPatch, OMIT_HEADERS, structuredPatch } from "diff";

/** The changed lines from `before` to `after` as unified diff hunks, 2 lines of context, no headers. */
export const unifiedDiff = (before: string, after: string): string =>
  formatPatch(
    structuredPatch("", "", before, after, undefined, undefined, { context: 2 }),
    OMIT_HEADERS,
  ).trimEnd();

/** What a reminder carries. */
export type ReminderKind = "instructions" | "tools" | "memory" | "context";

/** Text the harness wrote, not the user, in a user message. */
export const reminder = (kind: ReminderKind, text: string): string =>
  `<reminder kind="${kind}">\n${text}\n</reminder>`;
