/**
 * How long the assistant worked on a turn and how many files it changed, as a faint rule set before
 * its answer.
 */

import type { RoleColor } from "../tokens/roles.ts";
import { formatDuration } from "./duration.ts";

const changesOf = (filesChanged: number) => {
  if (filesChanged === 0) return "";

  return ` · ${filesChanged} ${filesChanged === 1 ? "file" : "files"} changed`;
};

export function Worked(props: {
  readonly color: RoleColor;
  readonly seconds: number;
  readonly filesChanged: number;
}) {
  return (
    <box flexDirection="row" height={1} gap={1}>
      <text wrapMode="none" flexShrink={0} fg={props.color("text.faint")}>
        {`Worked for ${formatDuration(props.seconds)}${changesOf(props.filesChanged)}`}
      </text>
      <box flexGrow={1} height={1} border={["top"]} borderColor={props.color("border.subtle")} />
    </box>
  );
}
