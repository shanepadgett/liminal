/**
 * One row of a list the user moves through. The row under the cursor is highlighted across its
 * panel, the highlight reaching one column into the side padding.
 */

import type { JSX } from "@opentui/solid";

import type { RoleColor } from "@liminal/sdk/tui";

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
