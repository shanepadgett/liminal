/**
 * Session approval modes, over the settings' mode, and the approval settings. A mode is saved in
 * the session and kept in memory; a restarted server reads the newest saved one.
 */

import { Effect, Option, Schema, Stream, SubscriptionRef } from "effect";

import { draft, type SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";
import type { Settings } from "@liminal/settings/contract";

import { type ApprovalMode, ApprovalSettings, ModeEntry } from "../contract.ts";

/** What invalid approval settings act as: every ask goes to the user, and nothing is added. */
const strictest: ApprovalSettings = {
  mode: "ask",
  decisionModel: "off",
  safeCommands: [],
  askCommands: [],
};

export interface Modes {
  /** The `approval` section, read on each call. */
  readonly settings: Effect.Effect<ApprovalSettings>;
  readonly get: (session: SessionId) => Effect.Effect<ApprovalMode>;
  readonly set: (session: SessionId, mode: ApprovalMode) => Effect.Effect<void>;
  readonly watch: (session: SessionId) => Stream.Stream<ApprovalMode>;
}

const decodeMode = Schema.decodeUnknownOption(ModeEntry.data);

/** The mode the session's newest mode entry holds; a failed read is logged and counts as none. */
const savedMode = (log: SessionLog["Service"], session: SessionId) =>
  log.lastOfKinds([ModeEntry]).pipe(
    Effect.map((entries) =>
      Option.flatMap(
        Option.fromNullishOr(entries.find((entry) => entry.sessionId === session)),
        (entry) => Option.map(decodeMode(entry.data), ({ mode }) => mode),
      ),
    ),
    Effect.catchTag("StoreError", (error) =>
      Effect.as(Effect.logWarning(`approval mode not read: ${error.message}`), Option.none()),
    ),
  );

export const makeModes = Effect.fn("makeModes")(function* (
  settings: Settings["Service"],
  log: SessionLog["Service"],
) {
  const own = yield* SubscriptionRef.make<ReadonlyMap<SessionId, ApprovalMode>>(new Map());
  // A session has no entries until its first message, so a mode set before then cannot be saved yet.
  const unsaved = new Set<SessionId>();

  const read = settings
    .section("approval", ApprovalSettings)
    .pipe(
      Effect.catchTag("SettingsInvalid", (error) =>
        Effect.as(Effect.logWarning(`approval settings ignored: ${error.message}`), strictest),
      ),
    );

  const inherited = Effect.fn("approval.inheritedMode")(function* (session: SessionId) {
    const saved = yield* savedMode(log, session);

    return Option.isSome(saved) ? saved.value : (yield* read).mode;
  });

  const modeIn = (map: ReadonlyMap<SessionId, ApprovalMode>, session: SessionId) => {
    const set = map.get(session);

    return set === undefined ? inherited(session) : Effect.succeed(set);
  };

  /** Saves the mode in the session; a failed save is logged, since the mode still applies. */
  const save = (session: SessionId, mode: ApprovalMode) =>
    log
      .append(session, [draft(ModeEntry, { data: { mode }, text: `Approval mode: ${mode}` })])
      .pipe(
        Effect.andThen(Effect.sync(() => unsaved.delete(session))),
        Effect.catchTag("SessionNotFound", () => Effect.void),
        Effect.tapError((error) => Effect.logWarning(`approval mode not saved: ${error.message}`)),
        Effect.ignore,
      );

  const modes: Modes = {
    settings: read,
    get: Effect.fn("approval.mode")(function* (session: SessionId) {
      const mode = yield* Effect.flatMap(SubscriptionRef.get(own), (map) => modeIn(map, session));
      if (unsaved.has(session)) yield* save(session, mode);

      return mode;
    }),
    set: Effect.fn("approval.setMode")(function* (session: SessionId, mode: ApprovalMode) {
      yield* SubscriptionRef.update(own, (map) => new Map(map).set(session, mode));
      unsaved.add(session);
      yield* save(session, mode);
    }),
    watch: (session) =>
      SubscriptionRef.changes(own).pipe(
        Stream.mapEffect((map) => modeIn(map, session)),
        Stream.changes,
      ),
  };

  return modes;
});
