/**
 * Where the model's view starts over, as a row among the tool calls: a turning arrow, "Checkpoint"
 * in bold, and how many files it read back in for the model, if any, in faint text. Tool rows are
 * dimmed and memories are a star and italics; a checkpoint is its own mark at full strength.
 * Everything above stays in the transcript; the model now sees its memories and what follows.
 */

import { useColor } from "../../theme/theme.tsx";

const MARK = "↺";

const filesRead = (count: number) => `${count} ${count === 1 ? "file" : "files"} read`;

export function Checkpoint(props: {
  /** Files read back in for the model; none for a checkpoint written after the cache was lost. */
  readonly filesRead: number;
}) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <span style={{ fg: color("feedback.info") }}>{`${MARK} `}</span>
      <span style={{ fg: color("text.base"), bold: true }}>Checkpoint</span>
      <span style={{ fg: color("text.faint") }}>
        {props.filesRead === 0 ? "" : ` · ${filesRead(props.filesRead)}`}
      </span>
    </text>
  );
}
