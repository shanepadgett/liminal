/** Cancel: stops a session's running turn. */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { InvalidEntry, SessionId, SessionNotFound, StoreError } from "@liminal/sdk";

export class CancelRpcs extends RpcGroup.make(
  Rpc.make("cancel/turn", {
    payload: { session: SessionId },
    error: Schema.Union([SessionNotFound, InvalidEntry, StoreError]),
  }),
) {}
