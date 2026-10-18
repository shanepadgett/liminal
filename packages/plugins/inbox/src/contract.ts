/** Inbox: the user's input to a session, sent now or queued while a turn runs. */

import { Context, type Effect, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { InvalidEntry, SessionId, SessionNotFound, StoreError } from "@liminal/sdk";

/**
 * How input sent while a turn runs joins it: a steer before the turn's next model call, a follow-up
 * once the turn would end. Input sent while no turn runs starts one.
 */
export const SendMode = Schema.Literals(["steer", "follow-up"]);

export type SendMode = typeof SendMode.Type;

/** A session's input waiting for its running turn, oldest first; kept in memory only. */
export const Queued = Schema.Struct({
  steers: Schema.Array(Schema.String),
  followUps: Schema.Array(Schema.String),
});

export type Queued = typeof Queued.Type;

/** No turn can start: its settings are missing or invalid. */
export class NoTurnSettings extends Schema.TaggedError<
  NoTurnSettings,
  { readonly brand: unique symbol }
>()("NoTurnSettings", { message: Schema.String }) {}

export const SendError = Schema.Union([NoTurnSettings, SessionNotFound, InvalidEntry, StoreError]);

export type SendError = typeof SendError.Type;

export class Inbox extends Context.Service<
  Inbox,
  {
    /**
     * Starts a turn on `text` when none runs, with any input still queued saved before it;
     * otherwise queues `text` by `mode`.
     */
    readonly send: (
      session: SessionId,
      text: string,
      mode: SendMode,
    ) => Effect.Effect<void, SendError>;
    /** The session's queue now, then after each change. */
    readonly queue: (session: SessionId) => Stream.Stream<Queued>;
  }
>()("liminal/inbox/Inbox") {}

export class InboxRpcs extends RpcGroup.make(
  Rpc.make("inbox/send", {
    payload: { session: SessionId, text: Schema.String, mode: SendMode },
    error: SendError,
  }),
  Rpc.make("inbox/queue", { payload: { session: SessionId }, success: Queued, stream: true }),
) {}
