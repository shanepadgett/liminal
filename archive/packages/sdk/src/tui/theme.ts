/** The active palette: its role colors, supplied by the renderer to every component. */

import { Context } from "effect";
import { type Accessor, createContext, createSignal, useContext } from "solid-js";

import { DEFAULT_PALETTE_ID, type Palette, paletteOf } from "./tokens/palettes.ts";
import type { RoleColor } from "./tokens/roles.ts";

export const ColorContext = createContext<RoleColor>();

/** The role colors of the active palette. */
export const useColor = (): RoleColor => {
  const color = useContext(ColorContext);
  if (color === undefined) throw new Error("useColor called outside a ColorContext.");

  return color;
};

export interface TuiThemeService {
  /** The palette on screen. */
  readonly palette: Accessor<Palette>;
  /** Shows the palette named `id`, or the default one when none has that name. */
  readonly select: (id?: string) => void;
}

/** The theme; every UI part's setup can read it. */
export class TuiTheme extends Context.Service<TuiTheme, TuiThemeService>()(
  "liminal/sdk/TuiTheme",
) {}

/** The default palette on screen. */
export const makeTuiTheme = (): TuiThemeService => {
  const [id, setId] = createSignal<string | undefined>(DEFAULT_PALETTE_ID);

  return { palette: () => paletteOf(id()), select: setId };
};
