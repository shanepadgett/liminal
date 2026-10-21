/**
 * Where the work ends and what the turn leaves begins: one row of how long the turn worked, inking
 * in as the turn settles, as dim as the work above it.
 */

import { formatDuration, mixHex, type RoleColor, type RoleName } from "@liminal/sdk/tui";

import type { Ending } from "./frame.ts";

export function WorkedFor(props: { readonly color: RoleColor; readonly ending: Ending }) {
  const inked = (role: RoleName) =>
    mixHex(props.color("surface.base"), props.color(role), props.ending.drawn);

  return (
    <text>
      <span style={{ fg: inked("text.ghost") }}>{"◇ "}</span>
      <b style={{ fg: inked("text.ghost") }}>Worked</b>
      <span style={{ fg: inked("text.ghost") }}>
        {` for ${formatDuration(Math.round(props.ending.seconds))}`}
      </span>
    </text>
  );
}
