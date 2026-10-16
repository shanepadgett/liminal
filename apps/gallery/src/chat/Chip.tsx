/** A status or mode label on a solid fill, one cell of padding each side. */

import type { RoleColor, RoleName } from "../tokens/roles.ts";

export function Chip(props: {
  readonly color: RoleColor;
  readonly label: string;
  readonly fill: RoleName;
}) {
  return (
    <span style={{ bg: props.color(props.fill), fg: props.color("text.inverse") }}>
      {` ${props.label} `}
    </span>
  );
}
