/**
 * How much this project uses each tool: the model's calls in the workspace's saved sessions, each
 * weighing half as much for every 30 days of age.
 */

import { DateTime, Duration, Effect, Exit, Option, Schema } from "effect";

import type { Entry } from "@liminal/sdk";
import { type SessionLog, ToolCallEntry } from "@liminal/session-log/contract";

/** Each tool's use weight, by name. */
export type ToolUse = ReadonlyMap<string, number>;

const halfLife = Duration.days(30);

/** Calls older than this weigh under 2% and are not read. */
const window = Duration.days(180);

/** Reading every session's calls is slow, and use changes slowly. */
const cacheFor = Duration.hours(1);

const decodeCall = Schema.decodeUnknownOption(ToolCallEntry.data);

/** The weight of a call made `age` ago. */
const weightOf = (age: Duration.Duration) =>
  0.5 ** (Duration.toMillis(age) / Duration.toMillis(halfLife));

/** The use weights of the calls in `entries` made in `sessions`, as of `now`. */
const useOf = (
  entries: ReadonlyArray<Entry>,
  sessions: ReadonlySet<string>,
  now: DateTime.Utc,
): ToolUse => {
  const use = new Map<string, number>();

  for (const entry of entries) {
    if (!sessions.has(entry.sessionId)) continue;

    const call = decodeCall(entry.data);
    if (Option.isNone(call)) continue;

    const weight = weightOf(DateTime.distance(entry.at, now));
    use.set(call.value.name, (use.get(call.value.name) ?? 0) + weight);
  }

  return use;
};

/**
 * Reads the use weights, kept for an hour; a failed read is logged and gives no use, so search
 * still ranks by text.
 */
export const makeToolUse = (log: SessionLog["Service"]) => {
  const read = Effect.gen(function* () {
    const now = yield* DateTime.now;
    const sessions = new Set((yield* log.list).map((session) => session.id));

    const entries = yield* log.recentOfKinds(
      [ToolCallEntry],
      DateTime.subtractDuration(now, window),
    );

    return useOf(entries, sessions, now);
  });

  const cached = Effect.cachedWithTTL(read, (exit) =>
    Exit.isSuccess(exit) ? cacheFor : Duration.zero,
  );

  return Effect.map(cached, (use) =>
    use.pipe(
      Effect.catchTag("StoreError", (error) =>
        Effect.as(Effect.logWarning(`Couldn't read tool use: ${error.message}`), new Map()),
      ),
    ),
  );
};
