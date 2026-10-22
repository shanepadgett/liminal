/**
 * The palette on screen, its role colors and its code colors, given to every component through
 * Solid context.
 */
import type { SyntaxStyle } from "@opentui/core";
import { type JSX, useRenderer } from "@opentui/solid";
import { type Accessor, createContext, createMemo, onCleanup, useContext } from "solid-js";

import type { Palette } from "./palettes.ts";
import { resolveRoles, type RoleColor } from "./roles.ts";
import { syntaxStyle } from "./syntax.ts";

export interface Theme {
  readonly palette: Palette;
  readonly color: RoleColor;
  /** For `markdown`, `code` and `diff`. */
  readonly syntax: SyntaxStyle;
}

const ThemeContext = createContext<Accessor<Theme>>();

export function ThemeProvider(props: {
  readonly palette: Palette;
  readonly children: JSX.Element;
}) {
  const renderer = useRenderer();
  // One style per palette, kept until the provider goes, so switching back does not rebuild it.
  const styles = new Map<string, SyntaxStyle>();

  const theme = createMemo((): Theme => {
    const color = resolveRoles(props.palette);
    const syntax = styles.get(props.palette.id) ?? syntaxStyle(color, renderer.nativeScene);
    styles.set(props.palette.id, syntax);

    return { palette: props.palette, color, syntax };
  });

  onCleanup(() => {
    for (const style of styles.values()) style.destroy();
  });

  return <ThemeContext.Provider value={theme}>{props.children}</ThemeContext.Provider>;
}

/** The theme on screen; reading it inside JSX redraws when the palette changes. */
export const useTheme = (): Accessor<Theme> => {
  const theme = useContext(ThemeContext);
  if (theme === undefined) throw new Error("useTheme was called outside a ThemeProvider.");

  return theme;
};

/** The role colors on screen; calling it inside JSX redraws when the palette changes. */
export const useColor = (): RoleColor => {
  const theme = useTheme();

  return (role) => theme().color(role);
};
