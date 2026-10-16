/** The status mark and the label that lead a tool call's line or a group's line. */

import type { RoleColor } from "../tokens/roles.ts";
import type { ToolStatus } from "./entries.ts";
import { StatusMark } from "./StatusMark.tsx";

export function StatusLabel(props: {
  readonly color: RoleColor;
  readonly status: ToolStatus;
  readonly label: string;
}) {
  return (
    <box flexDirection="row" flexShrink={0} gap={1}>
      <StatusMark color={props.color} status={props.status} />
      <text wrapMode="none" flexShrink={0} fg={props.color("feedback.info")}>
        {props.label}
      </text>
    </box>
  );
}
