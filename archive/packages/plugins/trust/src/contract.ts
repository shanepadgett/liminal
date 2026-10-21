/** Trust: whether the user trusts the workspace, and trusting it. */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { CompositionInvalid, CompositionWriteFailed } from "@liminal/sdk";

/** The workspace folder and whether the user trusts it. */
export const TrustState = Schema.Struct({ workspace: Schema.String, trusted: Schema.Boolean });

export type TrustState = typeof TrustState.Type;

export class TrustRpcs extends RpcGroup.make(
  Rpc.make("trust/workspace", { success: TrustState, error: CompositionInvalid }),
  /** Trusts the workspace from now on; its plugins load with the graph change that follows. */
  Rpc.make("trust/trust", { error: Schema.Union([CompositionInvalid, CompositionWriteFailed]) }),
) {}
