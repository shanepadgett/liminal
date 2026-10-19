/** Usage: what a session's model calls used and cost, for frontends. */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SessionId } from "@liminal/sdk";

/** What a session's model calls used: the latest call's context, and the cost of them all. */
export const SessionUsage = Schema.Struct({
  /** The latest call's request and reply tokens. */
  context: Schema.Int,
  /** The context window of the latest call's model; absent when its details could not be read. */
  contextWindow: Schema.optionalKey(Schema.Int),
  /** The share of the latest request read from the cache, from 0 to 1; absent when it sent none. */
  cacheHit: Schema.optionalKey(Schema.Finite),
  /** US dollars for the calls whose model has a price; absent when none has. */
  cost: Schema.optionalKey(Schema.Finite),
  /** The models of the session's calls that have no price, left out of `cost`. */
  unpriced: Schema.Int,
});

export type SessionUsage = typeof SessionUsage.Type;

/** Usage's commands for frontends. */
export class UsageRpcs extends RpcGroup.make(
  /** The session's usage once it has a reply, then again after each new one. */
  Rpc.make("usage/session", {
    payload: { session: SessionId },
    success: SessionUsage,
    stream: true,
  }),
) {}
