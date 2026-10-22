/**
 * Where the model's view starts over: a faint line across the transcript with "Checkpoint" in its
 * middle, and how many files the checkpoint read back in for the model, if any. Everything above
 * stays in the transcript; the model now sees its memories and what follows.
 */

import { useColor } from "../../theme/theme.tsx";

const filesRead = (count: number) => `${count} ${count === 1 ? "file" : "files"} read`;

/** One stretch of the line: a box whose only border is its top edge. */
function Line() {
  const color = useColor();

  return <box flexGrow={1} height={1} border={["top"]} borderColor={color("border.subtle")} />;
}

export function Checkpoint(props: {
  /** Files read back in for the model; none for a checkpoint written after the cache was lost. */
  readonly filesRead: number;
}) {
  const color = useColor();

  return (
    <box flexDirection="row" flexShrink={0} marginBottom={1}>
      <Line />
      {/* A text at a half column is drawn a column left of where the lines end; a box rounds like them. */}
      <box flexShrink={0}>
        <text wrapMode="none" fg={color("text.faint")}>
          {props.filesRead === 0 ? " Checkpoint " : ` Checkpoint · ${filesRead(props.filesRead)} `}
        </text>
      </box>
      <Line />
    </box>
  );
}
