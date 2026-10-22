/**
 * Liminal's palettes as OKLCH ramps, and the `theme` setting frontends read and write. The role
 * names components use live in `@shanepadgett/liminal-client`.
 */
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { Setting } from "@shanepadgett/liminal-settings/contract";

/** The `theme` key in `settings.json`: the palette's id. */
export const ThemeSetting = Setting.make(
  "theme",
  Schema.Struct({ palette: Schema.optionalKey(Schema.String) }),
);

/** The settings files could not be read or written. */
export class ThemeFailed extends Schema.TaggedError<
  ThemeFailed,
  { readonly brand: unique symbol }
>()("ThemeFailed", { message: Schema.String }) {}

export class ThemeRpc extends RpcGroup.make(
  /** The saved palette's id, or none when the user has not picked one. */
  Rpc.make("theme/get", { success: Schema.UndefinedOr(Schema.String), error: ThemeFailed }),
  /** Saves the palette's id in the global settings file. */
  Rpc.make("theme/set", { payload: { palette: Schema.String }, error: ThemeFailed }),
) {}

/** A ramp's steps, light to dark, Tailwind style. */
export type Step = 50 | 100 | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950;

/** One hue in light-to-dark steps. */
export interface RampSpec {
  readonly hue: number;
  /** Chroma at the ramp's middle; the ends fade toward gray so light and dark steps stay calm. */
  readonly chroma: number;
  /** Added to every step's lightness, to darken (negative) or lighten a ramp as a whole. */
  readonly shift?: number;
  /**
   * Added to the lightness of steps 300 and lighter, which hold a neutral ramp's text, so text can
   * dim without moving the surfaces.
   */
  readonly textShift?: number;
  readonly steps: ReadonlyArray<Step>;
}

export type RampName = "neutral" | "accent" | "danger" | "warning" | "success" | "info";

/** A near-colorless base and a single accent, with the status hues beside them. */
export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly mood: string;
  /** Why these colors belong together. */
  readonly rationale: string;
  readonly ramps: Readonly<Record<RampName, RampSpec>>;
}
