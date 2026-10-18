/** The active palette's role colors, supplied by the renderer to every component. */

import { createContext, useContext } from "solid-js";

import type { RoleColor } from "./tokens/roles.ts";

export const ColorContext = createContext<RoleColor>();

/** The role colors of the active palette. */
export const useColor = (): RoleColor => {
  const color = useContext(ColorContext);
  if (color === undefined) throw new Error("useColor called outside a ColorContext.");

  return color;
};
