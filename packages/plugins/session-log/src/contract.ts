/**
 * The session log: how code appends, reads and follows a session, and the entry kinds it decodes
 * with.
 */

import { Context, type DateTime, type Effect, Option, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  defineEntry,
  defineEvent,
  draft,
  type Entry,
  type EntryDefinition,
  type EntryDraft,
  FinishReason,
  ImagePart,
  type InvalidEntry,
  KeyedRegistry,
  type LiveState,
  type ModelPart,
  ModelRef,
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
  /**
   * Its name when the agent gave it one, else the first line of its first user message; empty until
   * there is either.
   */
  title: Schema.String,
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
    /** The sessions started in this workspace, most recently updated first. */
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
    /** Per session, its newest entry of any of `kinds`; sessions with none are left out. */
    readonly lastOfKinds: (
      kinds: ReadonlyArray<EntryDefinition>,
    ) => Effect.Effect<ReadonlyArray<Entry>, StoreError>;
    /**
     * Each session's own entries of any of `kinds`, a fork's inherited ones left out, in every
     * folder's sessions saved to at or after `since`; by session, then seq.
     */
    readonly recentOfKinds: (
      kinds: ReadonlyArray<EntryDefinition>,
      since: DateTime.Utc,
    ) => Effect.Effect<ReadonlyArray<Entry>, StoreError>;
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

/** What the user typed, and the pictures sent with it. */
export const UserEntry = defineEntry({
  kind: "session-log/user",
  data: Schema.Struct({ text: Schema.String, images: Schema.optionalKey(Schema.Array(ImagePart)) }),
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

/**
 * A call a `run` script made to another tool, inside the model's call `outer`; the model sees only
 * the outer call's result.
 */
export const InnerCallEntry = defineEntry({
  kind: "session-log/inner-call",
  data: Schema.Struct({
    outer: Schema.String,
    id: Schema.String,
    name: Schema.String,
    params: Schema.Json,
    status: ToolResultStatus,
    result: Schema.Json,
    details: Schema.optionalKey(Schema.Json),
  }),
  model: false,
  user: "hidden",
});

/** What a turn's caller chooses for its model calls; `thinking` is a thinking option's id. */
export const TurnSettings = Schema.Struct({
  model: ModelRef,
  thinking: Schema.optionalKey(Schema.String),
  maxOutputTokens: Schema.optionalKey(Schema.Int),
});

export type TurnSettings = typeof TurnSettings.Type;

/** A turn began with these settings; without a later TurnEndedEntry it is still running. */
export const TurnStartedEntry = defineEntry({
  kind: "session-log/turn-started",
  data: TurnSettings,
  model: false,
  user: "hidden",
});

/** How a started turn ended; a turn stopped by an error has a notice saved before its end. */
export const TurnEndReason = Schema.Literals([
  "answered",
  "ended-by-plugin",
  "cancelled",
  "stopped",
]);

export type TurnEndReason = typeof TurnEndReason.Type;

/** A started turn ended. */
export const TurnEndedEntry = defineEntry({
  kind: "session-log/turn-ended",
  data: Schema.Struct({ end: TurnEndReason }),
  model: false,
  user: "hidden",
});

/** A session's name: one plain line of about 10 words. */
export const SessionName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isNonEmpty(),
  Schema.isMaxLength(80),
  Schema.isPattern(/^[^\n\r]*$/, { message: "a name is one line" }),
);

/** The model named the session; the newest one is its name. */
export const NamedEntry = defineEntry({
  kind: "session-log/named",
  data: Schema.Struct({ name: SessionName }),
  model: false,
  user: "debug",
});

/** The core entry kinds, registered by session-log's server. */
export const coreEntries: ReadonlyArray<EntryDefinition> = [
  UserEntry,
  TextEntry,
  ReasoningEntry,
  ToolCallEntry,
  ToolResultEntry,
  InnerCallEntry,
  TurnStartedEntry,
  TurnEndedEntry,
  NamedEntry,
];

/**
 * A user message, sent to the model as user text, then `attached`: text the message's tags add,
 * such as folder listings, and pictures.
 */
export const userMessage = (
  text: string,
  attached: ReadonlyArray<ModelPart> = [],
): EntryDraft<typeof UserEntry.data.Type> => {
  const images = attached.filter((part): part is ImagePart => part.type === "image");

  return draft(UserEntry, {
    data: images.length === 0 ? { text } : { text, images },
    model: [{ role: "user", parts: [{ type: "text", text, providerData: {} }, ...attached] }],
    text,
  });
};

const decodeFinish = Schema.decodeUnknownOption(Schema.Struct({ finish: Finish }));

/** The finish saved on a reply's last part; none for any other entry. */
export const finishOf = (entry: Entry): Option.Option<Finish> =>
  Option.map(decodeFinish(entry.data), ({ finish }) => finish);

const decodeTurn = Schema.decodeUnknownOption(TurnSettings);

/** The model a turn-started entry names; none for any other entry. */
export const turnModelOf = (entry: Entry): Option.Option<ModelRef> =>
  entry.kind === TurnStartedEntry.kind
    ? Option.map(decodeTurn(entry.data), (settings) => settings.model)
    : Option.none();
