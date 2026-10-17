/**
 * The session log: how code appends, reads and follows a session, and the entry kinds it decodes
 * with.
 */

import { Context, type Effect, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  defineEntry,
  defineEvent,
  draft,
  type Entry,
  type EntryDefinition,
  type EntryDraft,
  FinishReason,
  type InvalidEntry,
  KeyedRegistry,
  type LiveState,
  type Seq,
  SessionId,
  type SessionNotFound,
  StoreError,
  type Synced,
  Usage,
} from "@liminal/sdk";

/** A session in the list of sessions; times are when it was created and last written. */
export const SessionSummary = Schema.Struct({
  id: SessionId,
  parentId: Schema.NullOr(SessionId),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  /** Its highest seq; 0 while it has no entries. */
  lastSeq: Schema.Int,
});

export type SessionSummary = typeof SessionSummary.Type;

/** A session was created; clients reread the list of sessions. */
export const SessionsChanged = defineEvent({
  name: "session-log/sessions-changed",
  data: Schema.Struct({}),
});

export interface SeqRange {
  readonly after?: Seq;
  readonly through?: Seq;
}

export class SessionLog extends Context.Service<
  SessionLog,
  {
    readonly create: (session: SessionId) => Effect.Effect<void, StoreError>;
    /** Every session, most recently updated first. */
    readonly list: Effect.Effect<ReadonlyArray<SessionSummary>, StoreError>;
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

/** The session commands clients call. */
export class SessionLogRpcs extends RpcGroup.make(
  Rpc.make("session-log/create", { payload: { session: SessionId }, error: StoreError }),
  Rpc.make("session-log/list", { success: Schema.Array(SessionSummary), error: StoreError }),
) {}

/** How a reply ended; saved on the reply's last part. */
export const Finish = Schema.Struct({ reason: FinishReason, usage: Usage });
export type Finish = typeof Finish.Type;

/** What the user typed. */
export const UserEntry = defineEntry({
  kind: "session-log/user",
  data: Schema.Struct({ text: Schema.String }),
  model: true,
  user: "shown",
});

const StreamedText = Schema.Struct({
  text: Schema.String,
  /** Cut short by a cancel; the model sees what was said. */
  interrupted: Schema.Boolean,
  finish: Schema.optionalKey(Finish),
});

/** One text part of a reply. */
export const TextEntry = defineEntry({
  kind: "session-log/text",
  data: StreamedText,
  model: true,
  user: "shown",
});

/** One reasoning part of a reply. */
export const ReasoningEntry = defineEntry({
  kind: "session-log/reasoning",
  data: StreamedText,
  model: true,
  user: "shown",
});

/** One tool call of a reply. */
export const ToolCallEntry = defineEntry({
  kind: "session-log/tool-call",
  data: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    params: Schema.Json,
    finish: Schema.optionalKey(Finish),
  }),
  model: true,
  user: "shown",
});

export const ToolResultStatus = Schema.Literals([
  "done",
  "failed",
  "denied",
  "cancelled",
  "interrupted",
]);

export type ToolResultStatus = typeof ToolResultStatus.Type;

/** A tool call's result; every status but `done` is a failure the model sees. */
export const ToolResultEntry = defineEntry({
  kind: "session-log/tool-result",
  data: Schema.Struct({
    callId: Schema.String,
    name: Schema.String,
    status: ToolResultStatus,
    result: Schema.Json,
    details: Schema.optionalKey(Schema.Json),
  }),
  model: true,
  user: "shown",
});

/** The core entry kinds, registered by session-log's server. */
export const coreEntries: ReadonlyArray<EntryDefinition> = [
  UserEntry,
  TextEntry,
  ReasoningEntry,
  ToolCallEntry,
  ToolResultEntry,
];

/** A user message, sent to the model as user text. */
export const userMessage = (text: string): EntryDraft<typeof UserEntry.data.Type> =>
  draft(UserEntry, {
    data: { text },
    model: [{ role: "user", parts: [{ type: "text", text, providerData: {} }] }],
    text,
  });
