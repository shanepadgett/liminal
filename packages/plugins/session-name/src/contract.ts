/** The tool the model names its session with, and the RPC that follows a session's name. */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  EventInvalid,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

/** The name of the tool the model names its session with. */
export const nameSessionName = "name_session";

export class SessionNameRpc extends RpcGroup.make(
  /** The session's name once it has one, then each new one. */
  Rpc.make("session-name/name", {
    payload: { session: SessionId },
    success: Schema.String,
    error: Schema.Union([SessionNotFound, SessionStoreFailed, EventInvalid]),
    stream: true,
  }),
) {}
