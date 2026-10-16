/**
 * The form a turn left for the user, settled into one line under how long it worked: its title and
 * how many questions it holds. The questions themselves come back in the user's answers. The line
 * inks in with the worked line.
 */

import { mixHex } from "../tokens/oklch.ts";
import type { RoleColor, RoleName } from "../tokens/roles.ts";

export function Asked(props: {
  readonly color: RoleColor;
  readonly title: string;
  readonly count: number;
  readonly drawn: number;
}) {
  const inked = (role: RoleName) =>
    mixHex(props.color("surface.base"), props.color(role), props.drawn);

  return (
    <text>
      <span style={{ fg: inked("text.accent") }}>{"? "}</span>
      <span style={{ fg: inked("text.base") }}>{props.title}</span>
      <span style={{ fg: inked("text.ghost") }}>{`  ${props.count} questions for you`}</span>
    </text>
  );
}
