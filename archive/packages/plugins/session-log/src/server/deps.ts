/** What the SessionLog's parts share: the store, the entry kinds and the change feeds. */

import { Effect, Predicate, type PubSub } from "effect";

import { type SessionId, SessionNotFound, StoreError } from "@liminal/sdk";
import type * as Store from "@liminal/session-store/contract";

import type { EntryKinds } from "../contract.ts";

export interface LogDeps {
  readonly store: Store.SessionStore["Service"];
  readonly entryKinds: EntryKinds["Service"];
  /** The session that just saved entries; followers read what they have not seen. */
  readonly appended: PubSub.PubSub<SessionId>;
  /** The session whose live slot just changed; watchers reread it. */
  readonly liveChanges: PubSub.PubSub<SessionId>;
}

/** Recasts the store's errors as the log's. */
export const fromStore = <A, R>(
  effect: Effect.Effect<A, Store.SessionNotFound | Store.StoreError, R>,
) =>
  Effect.mapError(effect, (error) =>
    Predicate.isTagged(error, "SessionNotFound")
      ? new SessionNotFound({ sessionId: error.sessionId })
      : new StoreError({ message: error.message, cause: error.cause }),
  );
