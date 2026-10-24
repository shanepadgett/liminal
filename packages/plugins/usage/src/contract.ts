/** What a session's turn steps used and cost, served over `UsageRpc`. */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

/** A session's usage: its latest finished step's context, and the cost of every finished step. */
export const SessionUsage = Schema.Struct({
  /** The input tokens of the latest finished step; zero before the first. */
  context: Schema.Int,
  /** The context window of that step's model; missing when the catalog does not say. */
  contextWindow: Schema.optional(Schema.Int),
  /** The share of that step's input read from the cache, from 0 to 1; zero before the first. */
  cacheHit: Schema.Finite,
  /**
   * US dollars for the finished steps whose model has a price; zero before the first, missing when
   * steps finished and none has a price.
   */
  cost: Schema.optional(Schema.Finite),
  /** The finished steps whose model has no price, left out of `cost`. */
  unpriced: Schema.Int,
});

export type SessionUsage = typeof SessionUsage.Type;

export class UsageRpc extends RpcGroup.make(
  /** The session's usage now, then again after each step starts or ends. */
  Rpc.make("usage/session", {
    payload: { session: SessionId },
    success: SessionUsage,
    error: Schema.Union([SessionNotFound, SessionStoreFailed]),
    stream: true,
  }),
) {}
