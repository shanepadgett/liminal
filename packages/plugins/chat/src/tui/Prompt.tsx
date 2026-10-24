/** An input the user sent, as the transcript draws it. */

import { createSignal, For } from "solid-js";

import { kit, useColor, useMix } from "@shanepadgett/liminal-tui";

import { markRanges, type Written } from "../view/index.ts";

/** The most rows an input takes in the transcript; past them it ends in an ellipsis. */
const PROMPT_ROWS = 3;

const BAR = "▌";

const ELLIPSIS = "…";

/** One cell of an input, and whether it lies in a mark such as `$skill`. */
interface Cell {
  readonly char: string;
  readonly marked: boolean;
}

type Line = readonly Cell[];

const SPACE: Cell = { char: " ", marked: false };

/** A run of cells drawn in one color. */
interface Run {
  text: string;
  readonly marked: boolean;
}

/** `written`'s cells, each marked when it lies in one of its marks. */
const cellsOfWritten = (written: Written): Line => {
  const ranges = markRanges(written.text, written.marks);
  let offset = 0;

  return kit.cellsOf(written.text).map((char) => {
    const at = offset;
    offset += char.length;

    return { char, marked: ranges.some((range) => at >= range.start && at < range.end) };
  });
};

/** `cells` split at each cell that is `char`, which is dropped. */
const splitOn = (cells: Line, char: string): readonly Line[] => {
  const parts: Cell[][] = [[]];

  for (const cell of cells) {
    if (cell.char === char) parts.push([]);
    else parts.at(-1)?.push(cell);
  }

  return parts;
};

/** A word's cells cut into pieces that each fit on a line. */
const piecesOf = (word: Line, columns: number): readonly Line[] => {
  const count = Math.max(1, Math.ceil(word.length / columns));

  return Array.from({ length: count }, (_, index) =>
    word.slice(index * columns, (index + 1) * columns),
  );
};

/** One paragraph word-wrapped to `columns` cells. */
const wrap = (paragraph: Line, columns: number): readonly Line[] => {
  const lines: Line[] = [];
  let line: Line = [];

  for (const piece of splitOn(paragraph, " ").flatMap((word) => piecesOf(word, columns))) {
    const joined = line.length === 0 ? piece : [...line, SPACE, ...piece];

    if (joined.length <= columns) {
      line = joined;
      continue;
    }

    lines.push(line);
    line = piece;
  }

  lines.push(line);

  return lines;
};

/** `written` word-wrapped to `columns` cells. */
const linesOf = (written: Written, columns: number): readonly Line[] =>
  splitOn(cellsOfWritten(written), "\n").flatMap((paragraph) => wrap(paragraph, columns));

/** `lines` cut to at most `rows`, the last cut ending in `…`. */
const clamped = (lines: readonly Line[], columns: number, rows: number): readonly Line[] => {
  if (lines.length <= rows) return lines;

  const cut = (lines[rows - 1] ?? []).slice(0, columns - 1);
  const last = cut.slice(0, cut.findLastIndex((cell) => cell.char.trim() !== "") + 1);

  return [...lines.slice(0, rows - 1), [...last, { char: ELLIPSIS, marked: false }]];
};

/** `line`'s cells as runs of one color each; an empty line is one empty run, so it keeps its row. */
const runsOf = (line: Line): readonly Run[] => {
  const runs: Run[] = [];

  for (const cell of line) {
    const last = runs.at(-1);

    if (last?.marked === cell.marked) last.text += cell.char;
    else runs.push({ text: cell.char, marked: cell.marked });
  }

  return runs.length === 0 ? [{ text: "", marked: false }] : runs;
};

/**
 * What the user sent, on the raised surface behind a bar that runs the composer's gradient, so it
 * reads apart from the replies, with a blank row above and below the text. Up to three rows; a
 * longer input ends in an ellipsis until a click expands it, and another click folds it again.
 * Marks such as `$skill` keep the accent color the draft gave them.
 */
export function Prompt(props: {
  readonly input: Written;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const color = useColor();
  const mix = useMix();
  const [columns, setColumns] = createSignal(0);

  // Nothing until the band is measured, so the first frame does not wrap at the wrong width.
  const all = () => (columns() > 0 ? linesOf(props.input, columns()) : []);
  const isLong = () => all().length > PROMPT_ROWS;

  const lines = () => (props.expanded ? all() : clamped(all(), columns(), PROMPT_ROWS));

  // The bar also runs down the blank rows above and below the text.
  const bars = () =>
    kit.gradientOf(mix, color("gradient.from"), color("gradient.to"), lines().length + 2);

  return (
    <box
      flexDirection="row"
      flexShrink={0}
      backgroundColor={color("surface.raised")}
      onMouseUp={() => {
        if (isLong()) props.onToggle();
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
            <text wrapMode="none">
              <For each={runsOf(line)}>
                {(run) => (
                  <span style={{ fg: color(run.marked ? "text.accent" : "text.base") }}>
                    {run.text}
                  </span>
                )}
              </For>
            </text>
          )}
        </For>
      </box>
    </box>
  );
}
