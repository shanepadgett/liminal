/** Durable storage for session entries: what session-log saves and reads, in a store-neutral shape. */

import { Context, type Effect, Schema } from "effect";

/** An entry as stored; `data` and `model` are JSON text the store does not interpret. */
export const StoredEntry = Schema.Struct({
  sessionId: Schema.String,
  seq: Schema.Int,
  kind: Schema.String,
  /** Milliseconds since the Unix epoch. */
  at: Schema.Int,
  data: Schema.String,
  model: Schema.NullOr(Schema.String),
  text: Schema.String,
  user: Schema.Literals(["shown", "hidden", "debug"]),
});

export type StoredEntry = typeof StoredEntry.Type;

/** A session's one live slot; `data` is JSON text. */
export const StoredLive = Schema.Struct({ kind: Schema.String, data: Schema.String });

export type StoredLive = typeof StoredLive.Type;

/** Bounds on seq: entries with `after < seq <= through`. */
export interface SeqRange {
  readonly after?: number;
  readonly through?: number;
}

export class SessionNotFound extends Schema.TaggedError<
  SessionNotFound,
  { readonly brand: unique symbol }
>()("SessionNotFound", { sessionId: Schema.String }) {}

/** The storage medium failed or refused a write, such as an id or seq that already exists. */
export class StoreError extends Schema.TaggedError<StoreError, { readonly brand: unique symbol }>()(
  "StoreError",
  { message: Schema.String, cause: Schema.Defect() },
) {}

export class SessionStore extends Context.Service<
  SessionStore,
  {
    readonly createSession: (id: string) => Effect.Effect<void, StoreError>;
    /** A new session that starts with `parent`'s entries through `seq`. */
    readonly forkSession: (
      id: string,
      parent: string,
      seq: number,
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
    /** Saves every entry in one transaction, or none. */
    readonly saveEntries: (
      entries: readonly [StoredEntry, ...Array<StoredEntry>],
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
    /** The session's entries in seq order, its fork parents' entries first. */
    readonly readEntries: (
      sessionId: string,
      range: SeqRange,
    ) => Effect.Effect<ReadonlyArray<StoredEntry>, SessionNotFound | StoreError>;
    /** The highest seq the session holds, counting a fork's inherited entries; 0 when empty. */
    readonly lastSeq: (sessionId: string) => Effect.Effect<number, SessionNotFound | StoreError>;
    readonly readLive: (
      sessionId: string,
    ) => Effect.Effect<StoredLive | undefined, SessionNotFound | StoreError>;
    /** Overwrites the live slot; no `live` clears it. */
    readonly writeLive: (
      sessionId: string,
      live?: StoredLive,
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
  }
>()("liminal/session-store/SessionStore") {}
