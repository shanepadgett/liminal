/**
 * Theme: the `theme` section of `settings.json` names the palette. The TUI reads it when it starts
 * and writes the user's pick to the global file.
 */

import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

/**
 * The `theme` section. The palette is an id the TUI looks up, so the server needs no list of them;
 * a missing or unknown id is the default palette.
 */
export const ThemeSettings = Schema.Struct({ palette: Schema.optionalKey(Schema.String) });

export type ThemeSettings = typeof ThemeSettings.Type;

/** The settings could not be read or written; `message` says why, for the user. */
export class ThemeError extends Schema.TaggedError<ThemeError, { readonly brand: unique symbol }>()(
  "ThemeError",
  { message: Schema.String },
) {}

export const ThemeRpcs = RpcGroup.make(
  /** The saved palette id; none when the user has not picked one. */
  Rpc.make("theme/get", { success: Schema.UndefinedOr(Schema.String), error: ThemeError }),
  /** Saves `palette` in the global settings. */
  Rpc.make("theme/set", { payload: { palette: Schema.String }, error: ThemeError }),
);
