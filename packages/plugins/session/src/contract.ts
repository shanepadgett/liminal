import { Context, Effect, Option, Schema, type Stream } from "effect";
/** The session log: events saved per session, and deltas streamed to viewers without saving. */
import type { NonEmptyReadonlyArray } from "effect/Array";
import { Rpc, RpcGroup } from "effect/rpc";

import { Attributes } from "@shanepadgett/liminal-core";
import { Message } from "@shanepadgett/liminal-model/contract";

export const SessionId = Schema.String.pipe(Schema.brand("session/SessionId"));
export type SessionId = typeof SessionId.Type;

/** An event's place in its session's log, counting from 1. */
export const Seq = Schema.Int;
export type Seq = typeof Seq.Type;

export const SessionEvent = Schema.Struct({
  session: SessionId,
  seq: Seq,
  at: Schema.DateTimeUtc,
  kind: Schema.String,
  data: Schema.Json,
  attributes: Attributes,
});

export type SessionEvent = typeof SessionEvent.Type;

/** An event to append; the write sets its session, seq and time. */
export const NewEvent = Schema.Struct({
  kind: Schema.String,
  data: Schema.Json,
  attributes: Attributes,
});

export type NewEvent = typeof NewEvent.Type;

/** Output viewers see live and nothing saves, such as reply text as it streams. */
export const Delta = Schema.Struct({ kind: Schema.String, data: Schema.Json });
export type Delta = typeof Delta.Type;

/** What `live` sends: a saved event has a `seq`, a delta does not. */
export const LiveItem = Schema.Union([SessionEvent, Delta]);
export type LiveItem = typeof LiveItem.Type;

export class SessionNotFound extends Schema.TaggedError<
  SessionNotFound,
  { readonly brand: unique symbol }
>()("SessionNotFound", { session: SessionId, message: Schema.String }) {}

export class SessionStoreFailed extends Schema.TaggedError<
  SessionStoreFailed,
  { readonly brand: unique symbol }
>()("SessionStoreFailed", { message: Schema.String }) {}

/** A saved event or delta whose data its kind's schema rejects. */
export class EventInvalid extends Schema.TaggedError<
  EventInvalid,
  { readonly brand: unique symbol }
>()("EventInvalid", { kind: Schema.String, message: Schema.String }) {}

/** One kind of event or delta, with the schema of its data. */
export interface EventKind<T> {
  /** Unique across plugins; prefix it with the plugin's name, as in `session/notice`. */
  readonly kind: string;
  readonly schema: Schema.Codec<T, Schema.Json>;
  /** An event to append or a delta to publish. A value its own schema cannot encode is a bug. */
  readonly make: (data: T, attributes?: Attributes) => Effect.Effect<NewEvent>;
  /** The data of an event or delta of this kind, or none for any other kind. */
  readonly decode: (item: Delta) => Effect.Effect<Option.Option<T>, EventInvalid>;
}

export const defineEvent = <T>(
  kind: string,
  schema: Schema.Codec<T, Schema.Json>,
): EventKind<T> => ({
  kind,
  schema,
  make: (data, attributes = {}) =>
    Effect.map(Effect.orDie(Schema.encodeEffect(schema)(data)), (encoded) => ({
      kind,
      data: encoded,
      attributes,
    })),
  decode: (item) =>
    item.kind === kind
      ? Schema.decodeEffect(schema)(item.data).pipe(
          Effect.asSome,
          Effect.mapError(
            (error) =>
              new EventInvalid({
                kind,
                message: `A ${kind} event holds data its schema rejects: ${error.message}.`,
              }),
          ),
        )
      : Effect.succeedNone,
});

/** A message the model sees: a user's input, a reply or tool results. */
export const MessageEvent = defineEvent("session/message", Message);

/** A message for the user that the model never sees. */
export const Notice = defineEvent(
  "session/notice",
  Schema.Struct({ level: Schema.Literals(["info", "warning", "error"]), text: Schema.String }),
);

export class SessionLog extends Context.Service<
  SessionLog,
  {
    readonly open: (attributes?: Attributes) => Effect.Effect<SessionId, SessionStoreFailed>;
    /** Saves the events in order, all or none, numbering them inside the write. */
    readonly append: (
      session: SessionId,
      events: NonEmptyReadonlyArray<NewEvent>,
    ) => Effect.Effect<NonEmptyReadonlyArray<SessionEvent>, SessionNotFound | SessionStoreFailed>;
    /** Every saved event after `after`, oldest first. */
    readonly read: (
      session: SessionId,
      after?: Seq,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, SessionNotFound | SessionStoreFailed>;
    /** The latest 100 events, or the 100 before `before`, oldest first. */
    readonly page: (
      session: SessionId,
      before?: Seq,
    ) => Effect.Effect<ReadonlyArray<SessionEvent>, SessionNotFound | SessionStoreFailed>;
    /**
     * The saved events after `after`, the deltas published since the last append, then each new
     * event and delta. Covers writes made in this process.
     */
    readonly live: (
      session: SessionId,
      after?: Seq,
    ) => Stream.Stream<LiveItem, SessionNotFound | SessionStoreFailed>;
    readonly publish: (session: SessionId, delta: Delta) => Effect.Effect<void>;
  }
>()("session/SessionLog") {}

/** What screens call. */
export class SessionRpc extends RpcGroup.make(
  Rpc.make("session/open", { success: SessionId, error: SessionStoreFailed }),
  /** The latest 100 events, or the 100 before `before`, oldest first. */
  Rpc.make("session/page", {
    payload: { session: SessionId, before: Schema.optional(Seq) },
    success: Schema.Array(SessionEvent),
    error: Schema.Union([SessionNotFound, SessionStoreFailed]),
  }),
  Rpc.make("session/live", {
    payload: { session: SessionId, after: Schema.optional(Seq) },
    success: LiveItem,
    error: Schema.Union([SessionNotFound, SessionStoreFailed]),
    stream: true,
  }),
) {}
