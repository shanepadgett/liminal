/**
 * A checkpoint in the transcript: a faint rule across it with "Checkpoint" in its middle. Every
 * trigger draws the same rule; the transcript's gaps give it a blank line above and below.
 */

import { type RoleColor, useColor } from "@liminal/sdk/tui";

/** One stretch of the rule: a box whose only border is its top edge. */
function Rule(props: { readonly color: RoleColor }) {
  return (
    <box flexGrow={1} height={1} border={["top"]} borderColor={props.color("border.subtle")} />
  );
}

export function Checkpoint() {
  const color = useColor();

  return (
    <box flexDirection="row">
      <Rule color={color} />
      <text fg={color("text.ghost")}> Checkpoint </text>
      <Rule color={color} />
    </box>
  );
}
