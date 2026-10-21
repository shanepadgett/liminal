/**
 * Attention: the `attention` section of `settings.json` says whether the sound plays and which one.
 * The TUI reads it when it starts and writes the user's choices to the global file.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/** The plugin's name, as the kernel reports its status. */
export const attentionPlugin = "attention";

/**
 * The `attention` section. The sound is an id the TUI looks up, so the server needs no list of
 * them; a missing or unknown id is the default sound, and a missing `enabled` is on.
 */
export const AttentionSettings = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  sound: Schema.optionalKey(Schema.String),
});

export type AttentionSettings = typeof AttentionSettings.Type;

/** The settings could not be read or written; `message` says why, for the user. */
export class AttentionError extends Schema.TaggedError<
  AttentionError,
  { readonly brand: unique symbol }
>()("AttentionError", { message: Schema.String }) {}

export const AttentionRpcs = RpcGroup.make(
  /** The saved choices; a field is absent when the user has not made it. */
  Rpc.make("attention/get", { success: AttentionSettings, error: AttentionError }),
  /** Saves whether the sound plays in the global settings. */
  Rpc.make("attention/set-enabled", {
    payload: { enabled: Schema.Boolean },
    error: AttentionError,
  }),
  /** Saves the sound's id in the global settings. */
  Rpc.make("attention/set-sound", { payload: { sound: Schema.String }, error: AttentionError }),
);
