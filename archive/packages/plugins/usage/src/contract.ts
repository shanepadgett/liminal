/** Usage: what a session's model calls used and cost, and today's cost, for frontends. */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { type NoProps, SessionId, Slot } from "@liminal/sdk";

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

/** The usage of a session with no call yet, in `contextWindow` when its next model is known. */
export const idleUsage = (contextWindow?: number): SessionUsage => {
  const idle = { context: 0, cacheHit: 0, cost: 0, unpriced: 0 };

  return contextWindow === undefined ? idle : { ...idle, contextWindow };
};

/** What the sidebar shows: the session's usage and what every folder's calls cost today. */
export const UsageReport = Schema.Struct({
  /** The session's usage; all zero before its first reply. */
  session: SessionUsage,
  /** US dollars for every session's priced calls since local midnight; absent when none has. */
  today: Schema.optionalKey(Schema.Finite),
});

export type UsageReport = typeof UsageReport.Type;

/** The slots usage declares. */
export const UsageSlots = {
  /** Rows at the end of the sidebar's Context section, such as memory's budget and counts. */
  contextRows: Slot.list<NoProps, "session">("usage/context-rows", { scope: "session" }),
};

/** Usage's commands for frontends. */
export class UsageRpcs extends RpcGroup.make(
  /** The session's report now, then again after each burst of its new entries. */
  Rpc.make("usage/session", {
    payload: { session: SessionId },
    success: UsageReport,
    stream: true,
  }),
) {}
