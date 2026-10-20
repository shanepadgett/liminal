/** Archive commands and elapsed-time expiry, projected from each session's own entries. */

import { DateTime, Effect, Schema } from "effect";

import { draft, type Entry, SessionId, SessionNotFound, StoreError } from "@liminal/sdk";
import type { SessionStore, StoredSession } from "@liminal/session-store/contract";

import {
  type ArchiveAction,
  ArchiveStateEntry,
  InnerCallEntry,
  ReasoningEntry,
  type SessionSummary,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  TurnEndedEntry,
  TurnStartedEntry,
  UserEntry,
} from "../contract.ts";
import type { makeEntries } from "./entries-log.ts";

const ARCHIVE_AFTER = 7 * 24 * 60 * 60 * 1000;

const CONVERSATION_KINDS = [
  UserEntry,
  TextEntry,
  ReasoningEntry,
  ToolCallEntry,
  ToolResultEntry,
  InnerCallEntry,
  TurnStartedEntry,
  TurnEndedEntry,
];

const bySession = (entries: ReadonlyArray<Entry>) =>
  new Map(entries.map((entry) => [entry.sessionId, entry]));

const summarize = (
  stored: StoredSession,
  latest: {
    readonly activity: Entry | undefined;
    readonly user: Entry | undefined;
    readonly command: Entry | undefined;
  },
  now: number,
): SessionSummary => {
  const { activity, user, command } = latest;
  const activityAt = activity?.at ?? DateTime.makeUnsafe(stored.createdAt);
  const activityMillis = DateTime.toEpochMillis(activityAt);
  let expiresFrom = activityMillis;
  let isManualArchive = false;

  // Sequence order keeps a message sent in the same millisecond after an archive active.
  if (command !== undefined && command.seq > (user?.seq ?? 0)) {
    const { action } = Schema.decodeUnknownSync(ArchiveStateEntry.data)(command.data);
    isManualArchive = action === "archive";
    expiresFrom = Math.max(activityMillis, DateTime.toEpochMillis(command.at));
  }

  return {
    id: SessionId.make(stored.id),
    parentId: stored.parentId === null ? null : SessionId.make(stored.parentId),
    title: stored.name === "" ? stored.title : stored.name,
    createdAt: DateTime.makeUnsafe(stored.createdAt),
    updatedAt: DateTime.makeUnsafe(stored.updatedAt),
    lastSeq: stored.lastSeq,
    activityAt,
    archived: isManualArchive || now >= expiresFrom + ARCHIVE_AFTER,
  };
};

export const makeArchive = (
  store: SessionStore["Service"],
  workspace: string,
  entries: ReturnType<typeof makeEntries>,
) => {
  const workspaceSessions = store
    .listSessions(workspace)
    .pipe(
      Effect.mapError((error) => new StoreError({ message: error.message, cause: error.cause })),
    );

  const list = Effect.gen(function* () {
    const stored = yield* workspaceSessions;
    const activity = bySession(yield* entries.lastOfKinds(CONVERSATION_KINDS));
    const users = bySession(yield* entries.lastOfKinds([UserEntry]));
    const commands = bySession(yield* entries.lastOfKinds([ArchiveStateEntry]));
    const now = DateTime.toEpochMillis(yield* DateTime.now);

    return stored
      .map((session) => {
        const id = SessionId.make(session.id);

        return summarize(
          session,
          { activity: activity.get(id), user: users.get(id), command: commands.get(id) },
          now,
        );
      })
      .toSorted(
        (left, right) =>
          DateTime.toEpochMillis(right.activityAt) - DateTime.toEpochMillis(left.activityAt)
          || left.id.localeCompare(right.id),
      );
  });

  const setArchive = Effect.fn("SessionLog.setArchive")(function* (
    session: SessionId,
    action: ArchiveAction,
  ) {
    const sessions = yield* workspaceSessions;

    if (!sessions.some((each) => each.id === session)) {
      return yield* new SessionNotFound({ sessionId: session });
    }

    return yield* entries
      .append(session, [draft(ArchiveStateEntry, { data: { action }, text: "" })])
      .pipe(
        // This draft is built from a checked command and the registered core schema.
        Effect.catchTag("InvalidEntry", Effect.die),
        Effect.asVoid,
      );
  });

  return { list, setArchive };
};
