/** How long the assistant worked on a turn, as a faint rule set before its answer. */

import type { RoleColor } from "../tokens/roles.ts";
import { formatDuration } from "./duration.ts";

export function Worked(props: { readonly color: RoleColor; readonly seconds: number }) {
  return (
    <box flexDirection="row" height={1} gap={1}>
      <text wrapMode="none" flexShrink={0} fg={props.color("text.faint")}>
        {`Worked for ${formatDuration(props.seconds)}`}
      </text>
      <box flexGrow={1} height={1} border={["top"]} borderColor={props.color("border.subtle")} />
    </box>
  );
}
