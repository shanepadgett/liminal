/** The status glyph and the label that lead a tool call's line or a group's line. */

import type { RoleColor } from "../tokens/roles.ts";
import type { ToolStatus } from "./entries.ts";
import { STATUS } from "./status.ts";

export function StatusLabel(props: {
  readonly color: RoleColor;
  readonly status: ToolStatus;
  readonly label: string;
}) {
  const status = () => STATUS[props.status];

  return (
    <text wrapMode="none" flexShrink={0}>
      <span style={{ fg: props.color(status().role) }}>{status().glyph}</span>
      <span style={{ fg: props.color("feedback.info") }}>{` ${props.label}`}</span>
    </text>
  );
}
