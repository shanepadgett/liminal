/**
 * What the SessionLog's parts share: the store, the entry kinds, the write lock and the change
 * feeds.
 */

import { Effect, Predicate, type PubSub, type Semaphore } from "effect";

import type * as Store from "@liminal/session-store/contract";

import {
  type EntryKinds,
  type LiveState,
  type SessionId,
  SessionNotFound,
  StoreError,
} from "../contract.ts";

/** A live slot change, published after it is saved. */
export interface LiveChange {
  readonly session: SessionId;
  readonly live: LiveState | undefined;
}

export interface LogDeps {
  readonly store: Store.SessionStore["Service"];
  readonly entryKinds: EntryKinds["Service"];
  /** One write at a time, so seq stamping and publishing never interleave. */
  readonly lock: Semaphore.Semaphore;
  /** The session that just saved entries; followers read what they have not seen. */
  readonly appended: PubSub.PubSub<SessionId>;
  readonly liveChanges: PubSub.PubSub<LiveChange>;
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
