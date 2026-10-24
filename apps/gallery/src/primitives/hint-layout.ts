/**
 * How hints sit in the width a line has: all on one line when they fit; otherwise the leading ones
 * and `ctrl+g more`, or, expanded, every hint and `ctrl+g less` in columns. A hint is never split.
 */
import { cellsOf } from "./Gradient.tsx";

export interface Hint {
  readonly keys: string;
  readonly label: string;
}

/** Columns of hints, each read top to bottom; a line is columns of one hint each. */
export type HintColumns = ReadonlyArray<ReadonlyArray<Hint>>;

/** Cells between two hints on a line, and between two columns. */
export const HINT_GAP = 3;

const MORE: Hint = { keys: "ctrl+g", label: "more" };
const LESS: Hint = { keys: "ctrl+g", label: "less" };

const widthOf = (text: string) => cellsOf(text).length;

const widest = (texts: readonly string[]) => Math.max(0, ...texts.map(widthOf));

/** The cells a column gives its keys: its widest key. */
export const keyColumnsOf = (column: readonly Hint[]) => widest(column.map((hint) => hint.keys));

/** A hint's keys padded to `columns` cells, so the labels after them line up. */
export const paddedKeys = (hint: Hint, columns: number) =>
  hint.keys + " ".repeat(Math.max(0, columns - widthOf(hint.keys)));

const columnWidth = (column: readonly Hint[]) =>
  keyColumnsOf(column) + 1 + widest(column.map((hint) => hint.label));

const widthOfColumns = (columns: HintColumns) => {
  let total = HINT_GAP * Math.max(0, columns.length - 1);

  for (const column of columns) total += columnWidth(column);

  return total;
};

const lineOf = (hints: readonly Hint[]): HintColumns => hints.map((hint) => [hint]);

/** The leading hints that fit in `width` with `ctrl+g more` after them; nothing if it does not fit. */
const cutLine = (hints: readonly Hint[], width: number) => {
  const shown: Hint[] = [];

  for (const hint of hints) {
    if (widthOfColumns(lineOf([...shown, hint, MORE])) > width) break;
    shown.push(hint);
  }

  const line = lineOf([...shown, MORE]);

  return widthOfColumns(line) > width ? [] : line;
};

/** `hints` in at most `count` columns, filled top to bottom. */
const columnsOf = (hints: readonly Hint[], count: number): HintColumns => {
  const rows = Math.ceil(hints.length / count);

  return Array.from({ length: Math.ceil(hints.length / rows) }, (_, index) =>
    hints.slice(index * rows, (index + 1) * rows),
  );
};

/** `hints` and `ctrl+g less` in as many columns as fit in `width`; one column when none do. */
const grid = (hints: readonly Hint[], width: number) => {
  const all = [...hints, LESS];

  for (let count = all.length; count > 1; count -= 1) {
    const columns = columnsOf(all, count);
    if (widthOfColumns(columns) <= width) return columns;
  }

  return columnsOf(all, 1);
};

/** How `hints` sit in `width`; before the width is known, on one line. */
export const layoutOf = (
  hints: readonly Hint[],
  width: number | undefined,
  isExpanded: boolean,
): HintColumns => {
  const line = lineOf(hints);
  if (width === undefined || widthOfColumns(line) <= width) return line;

  return isExpanded ? grid(hints, width) : cutLine(hints, width);
};
