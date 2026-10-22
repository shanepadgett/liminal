/** The colors on screen, given by the theme's `tui` entry and read by every component. */
import type { SyntaxStyle } from "@opentui/core";
import { Context } from "effect";
import { type Accessor, createContext, useContext } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";

/** The hex color of a role. */
export type RoleColor = (role: RoleName) => string;

/** The color `amount` of the way from `from` to `to`, both hex. */
export type Mix = (from: string, to: string, amount: number) => string;

export class Colors extends Context.Service<
  Colors,
  {
    /** The role colors of the palette on screen; reading it inside JSX redraws on a change. */
    readonly color: Accessor<RoleColor>;
    /** For `markdown`, `code` and `diff`. */
    readonly syntax: Accessor<SyntaxStyle>;
    readonly mix: Mix;
  }
>()("tui/Colors") {}

const ColorsContext = createContext<Colors["Service"]>();

export const ColorsProvider = ColorsContext.Provider;

const useColors = (): Colors["Service"] => {
  const colors = useContext(ColorsContext);
  if (colors === undefined) throw new Error("A TUI component ran outside the TUI's root.");

  return colors;
};

/** The role colors on screen; calling it inside JSX redraws when the palette changes. */
export const useColor = (): RoleColor => {
  const colors = useColors();

  return (role) => colors.color()(role);
};

/** The syntax style on screen, for `markdown`, `code` and `diff`. */
export const useSyntax = (): Accessor<SyntaxStyle> => useColors().syntax;

export const useMix = (): Mix => useColors().mix;
