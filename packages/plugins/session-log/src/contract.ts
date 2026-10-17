/**
 * The session log: how code appends, reads and follows a session, and the entry kinds it decodes
 * with.
 */

import { Context, Data, type Effect, type Schema, type Stream } from "effect";

import {
  type Entry,
  type EntryDefinition,
  type EntryDraft,
  type InvalidEntry,
  KeyedRegistry,
  type Seq,
  type SessionId,
  type SessionNotFound,
  type StoreError,
} from "@liminal/sdk";

/** A session's one transient slot, such as a streaming reply; not part of the history. */
export interface LiveState {
  readonly kind: string;
  readonly data: Schema.Json;
}

/** Sent by `subscribe` after the saved entries; everything after it is live. */
export class Synced extends Data.TaggedClass("Synced")<{ readonly seq: Seq | undefined }> {}

export interface SeqRange {
  readonly after?: Seq;
  readonly through?: Seq;
}

export class SessionLog extends Context.Service<
  SessionLog,
  {
    readonly create: (session: SessionId) => Effect.Effect<void, StoreError>;
    /** Validates and saves the drafts as consecutive entries, all or none. */
    readonly append: (
      session: SessionId,
      drafts: readonly [EntryDraft, ...Array<EntryDraft>],
    ) => Effect.Effect<
      readonly [Entry, ...Array<Entry>],
      SessionNotFound | InvalidEntry | StoreError
    >;
    readonly read: (
      session: SessionId,
      range: SeqRange,
    ) => Effect.Effect<ReadonlyArray<Entry>, SessionNotFound | StoreError>;
    /** The saved entries after `from.after`, then Synced, then each new entry as it is saved. */
    readonly subscribe: (
      session: SessionId,
      from: { readonly after?: Seq },
    ) => Stream.Stream<Entry | Synced, SessionNotFound | StoreError>;
    /** No `live` clears the slot. */
    readonly setLive: (
      session: SessionId,
      live?: LiveState,
    ) => Effect.Effect<void, SessionNotFound | StoreError>;
    /** The saved slot, then each change. */
    readonly watchLive: (
      session: SessionId,
    ) => Stream.Stream<LiveState | undefined, SessionNotFound | StoreError>;
  }
>()("liminal/session-log/SessionLog") {}

/**
 * The entry kinds reads decode with, newest build first; a plugin registers its kinds in its
 * server's scope.
 */
export class EntryKinds extends KeyedRegistry.Service<EntryKinds, EntryDefinition>()(
  "liminal/session-log/EntryKinds",
) {}
