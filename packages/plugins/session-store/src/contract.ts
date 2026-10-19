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

/** An entry to append; the store gives it its session and seq. */
export type NewEntry = Omit<StoredEntry, "sessionId" | "seq">;

/** A session's one live slot; `data` is JSON text. */
export const StoredLive = Schema.Struct({ kind: Schema.String, data: Schema.String });

export type StoredLive = typeof StoredLive.Type;

/** A session's row in the index rebuilt from the log; times are milliseconds since the Unix epoch. */
export const StoredSession = Schema.Struct({
  id: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  /** The folder it was started in; empty for sessions saved before workspaces were kept. */
  workspace: Schema.String,
  /** Its first user message, cut to one line; empty until there is one. */
  title: Schema.String,
  /** The name the agent gave it; empty until it has one. */
  name: Schema.String,
  createdAt: Schema.Int,
  /** When its last entry was saved, or `createdAt` while it has none. */
  updatedAt: Schema.Int,
  /** Its highest seq, a fork's inherited entries included; 0 while it has none. */
  lastSeq: Schema.Int,
});

export type StoredSession = typeof StoredSession.Type;

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
    /** A new session started in the folder `workspace`. */
    readonly createSession: (id: string, workspace: string) => Effect.Effect<void, StoreError>;
    /** A new session that starts with `parent`'s entries through `seq`, in its folder. */
    readonly forkSession: (
      id: string,
      parent: string,
      seq: number,
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
    /**
     * Saves every entry in one transaction, or none, numbering them after the session's highest
     * seq, a fork's inherited entries included. The numbering happens inside the write, so writers
     * sharing the medium never take the same seq.
     */
    readonly appendEntries: (
      sessionId: string,
      entries: readonly [NewEntry, ...Array<NewEntry>],
    ) => Effect.Effect<readonly [StoredEntry, ...Array<StoredEntry>], SessionNotFound | StoreError>;
    /** The session's entries in seq order, its fork parents' entries first. */
    readonly readEntries: (
      sessionId: string,
      range: SeqRange,
    ) => Effect.Effect<ReadonlyArray<StoredEntry>, SessionNotFound | StoreError>;
    /** Names the session `title` while it has no name; a named session keeps its name. */
    readonly nameSession: (
      id: string,
      title: string,
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
    /** Names the session `name`, replacing any earlier name. */
    readonly setName: (
      id: string,
      name: string,
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
    /** The sessions started in `workspace`, most recently updated first. */
    readonly listSessions: (
      workspace: string,
    ) => Effect.Effect<ReadonlyArray<StoredSession>, StoreError>;
    /** Per session, its newest entry of any of `kinds`; sessions with none are left out. */
    readonly lastEntriesOfKinds: (
      kinds: ReadonlyArray<string>,
    ) => Effect.Effect<ReadonlyArray<StoredEntry>, StoreError>;
    /**
     * Each session's own entries of any of `kinds`, a fork's inherited ones left out, for every
     * session saved to at or after `since` (milliseconds since the Unix epoch); by session, then
     * seq.
     */
    readonly recentEntriesOfKinds: (
      kinds: ReadonlyArray<string>,
      since: number,
    ) => Effect.Effect<ReadonlyArray<StoredEntry>, StoreError>;
    /** Gives every saved entry of kind `from` the kind `to`, in every session. */
    readonly renameKind: (from: string, to: string) => Effect.Effect<void, StoreError>;
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
