/** An input the user sent, as the transcript draws it. */

import { createSignal, For } from "solid-js";

import { cellsOf, gradientOf } from "../../primitives/Gradient.tsx";
import { useColor } from "../../theme/theme.tsx";

/** The most rows an input takes in the transcript; past them it ends in an ellipsis. */
const PROMPT_ROWS = 3;

const BAR = "▌";

const ELLIPSIS = "…";

/** A word's cells cut into pieces that each fit on a line. */
const piecesOf = (word: string, columns: number): readonly string[] => {
  const cells = cellsOf(word);
  const count = Math.max(1, Math.ceil(cells.length / columns));

  return Array.from({ length: count }, (_, index) =>
    cells.slice(index * columns, (index + 1) * columns).join(""),
  );
};

/** One paragraph word-wrapped to `columns` cells. */
const wrap = (paragraph: string, columns: number): readonly string[] => {
  const lines: string[] = [];
  let line = "";

  for (const piece of paragraph.split(" ").flatMap((word) => piecesOf(word, columns))) {
    const joined = line === "" ? piece : `${line} ${piece}`;

    if (cellsOf(joined).length <= columns) {
      line = joined;
      continue;
    }

    lines.push(line);
    line = piece;
  }

  lines.push(line);

  return lines;
};

/** `text` word-wrapped to `columns` cells. */
const linesOf = (text: string, columns: number): readonly string[] =>
  text.split("\n").flatMap((paragraph) => wrap(paragraph, columns));

/** `lines` cut to at most `rows`, the last cut ending in `…`. */
const clamped = (lines: readonly string[], columns: number, rows: number): readonly string[] => {
  if (lines.length <= rows) return lines;

  const last = cellsOf(lines[rows - 1] ?? "")
    .slice(0, columns - 1)
    .join("")
    .trimEnd();

  return [...lines.slice(0, rows - 1), `${last}${ELLIPSIS}`];
};

/**
 * What the user sent, on the raised surface behind a bar that runs the composer's gradient, so it
 * reads apart from the replies, with a blank row above and below the text. Up to three rows; a
 * longer input ends in an ellipsis until a click expands it, and another click folds it again.
 */
export function Prompt(props: { readonly input: string; readonly isExpanded?: boolean }) {
  const color = useColor();
  const [columns, setColumns] = createSignal(0);
  const [expanded, setExpanded] = createSignal(props.isExpanded === true);

  // Nothing until the band is measured, so the first frame does not wrap at the wrong width.
  const all = () => (columns() > 0 ? linesOf(props.input, columns()) : []);
  const isLong = () => all().length > PROMPT_ROWS;

  const lines = () => (expanded() ? all() : clamped(all(), columns(), PROMPT_ROWS));

  // The bar also runs down the blank rows above and below the text.
  const bars = () => gradientOf(color("gradient.from"), color("gradient.to"), lines().length + 2);

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      backgroundColor={color("surface.raised")}
      onMouseUp={() => {
        if (isLong()) setExpanded(!expanded());
      }}
    >
      <box width={2} flexShrink={0}>
        <For each={bars()}>{(bar) => <text fg={bar}>{BAR}</text>}</For>
      </box>
      <box
        flexGrow={1}
        marginRight={1}
        paddingY={1}
        onSizeChange={function () {
          setColumns(this.width);
        }}
      >
        <For each={lines()}>
          {(line) => (
            <text wrapMode="none" fg={color("text.base")}>
              {line}
            </text>
          )}
        </For>
      </box>
    </box>
  );
}
