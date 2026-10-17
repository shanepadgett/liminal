/** The session log: entry kinds plugins define, and how code appends, reads and follows a session. */

import { Context, Data, type DateTime, type Effect, Schema, type Stream } from "effect";

import { Registry } from "@liminal/sdk";

export const SessionId = Schema.String.pipe(Schema.brand("SessionId"));
export type SessionId = typeof SessionId.Type;

/** Per session, from 1, without gaps. */
export const Seq = Schema.Int.pipe(Schema.brand("Seq"));
export type Seq = typeof Seq.Type;

/** Opaque provider metadata a provider needs back on the next request, such as signatures. */
const ProviderData = Schema.Record(Schema.String, Schema.Json);

/** What the model sees, in Liminal's own types, so an Effect upgrade cannot break saved sessions. */
export const ModelPart = Schema.Union([
  Schema.Struct({ type: Schema.Literal("text"), text: Schema.String, providerData: ProviderData }),
  Schema.Struct({
    type: Schema.Literal("reasoning"),
    text: Schema.String,
    providerData: ProviderData,
  }),
  Schema.Struct({
    type: Schema.Literal("tool-call"),
    id: Schema.String,
    name: Schema.String,
    params: Schema.Json,
    providerData: ProviderData,
  }),
  Schema.Struct({
    type: Schema.Literal("tool-result"),
    callId: Schema.String,
    name: Schema.String,
    result: Schema.Json,
    isFailure: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("image"),
    path: Schema.String,
    mediaType: Schema.Literals(["image/png", "image/jpeg", "image/webp"]),
  }),
]);

export type ModelPart = typeof ModelPart.Type;

export const ModelContent = Schema.Struct({
  role: Schema.Literals(["system", "user", "assistant", "tool"]),
  parts: Schema.Array(ModelPart),
});

export type ModelContent = typeof ModelContent.Type;

export const UserVisibility = Schema.Literals(["shown", "hidden", "debug"]);
export type UserVisibility = typeof UserVisibility.Type;

/** An entry kind; `data` encodes to JSON so the entry reads back with its plugin off. */
export interface EntryDefinition<A = unknown> {
  /** Prefixed with the defining plugin's name, such as `questions/asked`. */
  readonly kind: string;
  readonly data: Schema.Codec<A, Schema.Json>;
  /** Whether entries of this kind carry ModelContent. */
  readonly model: boolean;
  /** Every entry's visibility, or `per-entry` when each draft sets its own. */
  readonly user: UserVisibility | "per-entry";
}

/** Defines an entry kind in a plugin's contract; register it with `EntryKinds` in the server. */
export const defineEntry = <A>(definition: EntryDefinition<A>): EntryDefinition<A> => definition;

export interface Entry {
  readonly sessionId: SessionId;
  readonly seq: Seq;
  readonly kind: string;
  readonly at: DateTime.Utc;
  /** The kind's decoded data, or its JSON when no plugin defines the kind. */
  readonly data: unknown;
  /** Frozen when written. */
  readonly model?: ReadonlyArray<ModelContent>;
  /** Plain text for the user, frozen when written. */
  readonly text: string;
  readonly user: UserVisibility;
}

export interface EntryDraft {
  readonly kind: string;
  readonly data: unknown;
  readonly model?: ReadonlyArray<ModelContent>;
  readonly text: string;
  /** Required when the kind's visibility is `per-entry`, ignored otherwise. */
  readonly user?: UserVisibility;
}

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

export class SessionNotFound extends Schema.TaggedError<
  SessionNotFound,
  { readonly brand: unique symbol }
>()("SessionNotFound", { sessionId: Schema.String }) {}

export class UnknownEntryKind extends Schema.TaggedError<
  UnknownEntryKind,
  { readonly brand: unique symbol }
>()("UnknownEntryKind", { kind: Schema.String }) {}

/** A draft does not match its kind: wrong data, missing model content or missing visibility. */
export class InvalidEntry extends Schema.TaggedError<
  InvalidEntry,
  { readonly brand: unique symbol }
>()("InvalidEntry", { kind: Schema.String, message: Schema.String }) {}

export class StoreError extends Schema.TaggedError<StoreError, { readonly brand: unique symbol }>()(
  "StoreError",
  { message: Schema.String, cause: Schema.Defect() },
) {}

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
      SessionNotFound | UnknownEntryKind | InvalidEntry | StoreError
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

/** The entry kinds `append` accepts; a plugin registers its kinds in its server's scope. */
export class EntryKinds extends Registry.Service<EntryKinds, EntryDefinition>()(
  "liminal/session-log/EntryKinds",
) {}
