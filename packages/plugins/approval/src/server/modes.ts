/** Session approval modes, kept in memory over the settings' mode, and the approval settings. */

import { Effect, Stream, SubscriptionRef } from "effect";

import type { SessionId } from "@liminal/sdk";
import type { Settings } from "@liminal/settings/contract";

import { type ApprovalMode, ApprovalSettings } from "../contract.ts";

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

export const makeModes = Effect.fn("makeModes")(function* (settings: Settings["Service"]) {
  const own = yield* SubscriptionRef.make<ReadonlyMap<SessionId, ApprovalMode>>(new Map());

  const read = settings
    .section("approval", ApprovalSettings)
    .pipe(
      Effect.catchTag("SettingsInvalid", (error) =>
        Effect.as(Effect.logWarning(`approval settings ignored: ${error.message}`), strictest),
      ),
    );

  const modeIn = (map: ReadonlyMap<SessionId, ApprovalMode>, session: SessionId) => {
    const set = map.get(session);

    return set === undefined ? Effect.map(read, (section) => section.mode) : Effect.succeed(set);
  };

  const modes: Modes = {
    settings: read,
    get: (session) => Effect.flatMap(SubscriptionRef.get(own), (map) => modeIn(map, session)),
    set: (session, mode) => SubscriptionRef.update(own, (map) => new Map(map).set(session, mode)),
    watch: (session) =>
      SubscriptionRef.changes(own).pipe(
        Stream.mapEffect((map) => modeIn(map, session)),
        Stream.changes,
      ),
  };

  return modes;
});
