/** Helpers for declaring gallery entry states. */

import type { JSX } from "@opentui/solid";

import type { EntryState, Fill } from "./shell/entries.ts";
import { type RoleColor, resolveRoles } from "./tokens/roles.ts";

/** The one state of an entry that has no others. */
export const only = (fill: Fill, view: EntryState["view"]): readonly [EntryState] => [
  { name: "Default", fill, view },
];

/** A view drawn with the palette's roles. */
export const withRoles =
  (draw: (color: RoleColor) => JSX.Element): EntryState["view"] =>
  (palette) =>
    draw(resolveRoles(palette));
