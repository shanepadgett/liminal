/**
 * One row of a short list a custom prompt offers. The row under the cursor is highlighted across
 * the prompt, the highlight reaching one column into the side padding.
 */

import type { JSX } from "@opentui/solid";

import type { RoleColor } from "./tokens/roles.ts";

export function ListRow(props: {
  readonly color: RoleColor;
  readonly isSelected: boolean;
  readonly children: JSX.Element;
}) {
  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      backgroundColor={props.isSelected ? props.color("surface.selected") : "transparent"}
    >
      {props.children}
    </box>
  );
}
