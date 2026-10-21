/**
 * Environment adds prompt sections through context, and serves the sidebar's Session section: the
 * folder Liminal runs in and its git branch.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/** The plugin's name, as the kernel reports its status. */
export const environmentPlugin = "environment";

/** What the Session section shows. */
export const SessionInfo = Schema.Struct({
  /** The folder Liminal runs in, with the home folder written as `~`. */
  folder: Schema.String,
  /** The checked-out branch, or the short hash of a detached HEAD; absent outside a repository. */
  branch: Schema.optionalKey(Schema.String),
});

export type SessionInfo = typeof SessionInfo.Type;

/** Environment's commands for frontends. */
export class EnvironmentRpcs extends RpcGroup.make(
  Rpc.make("environment/session", { success: SessionInfo, stream: true }),
) {}
