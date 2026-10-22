/**
 * How streaming text arrives: the newest characters start at the background color and warm up to
 * their own over the last few, so text surfaces rather than prints. The rest of the word being
 * written is laid out in the background color, so a word never jumps to the next line halfway.
 */

import { useTimeline } from "@opentui/solid";
import { type Accessor, createSignal, For } from "solid-js";

import { mixHex } from "../theme/oklch.ts";
import type { RoleName } from "../theme/roles.ts";
import { useColor } from "../theme/theme.tsx";
import { cellsOf } from "./Gradient.tsx";

/** Characters this close behind the newest one are still warming up. */
export const FRESH_CELLS = 12;

/** How fast the gallery's sample streams write: about what a fast model sends. */
const CELLS_PER_SECOND = 220;

/** How long a finished sample stream rests before it writes again. */
const REST_MILLISECONDS = 1400;

/**
 * How many cells of a sample stream of `length` cells are out, looping: from none until all of it
 * has warmed up, then a rest.
 */
export const useStream = (length: number): Accessor<number> => {
  const total = length + FRESH_CELLS;
  const writing = (total / CELLS_PER_SECOND) * 1000;
  const [head, setHead] = createSignal(0);
  const timeline = useTimeline({ duration: writing + REST_MILLISECONDS, loop: true });
  // The timeline moves `stream.at` from 0 to 1 while writing; each update floors it into the signal.
  const stream = { at: 0 };

  timeline.add(stream, {
    at: 1,
    duration: writing,
    ease: "linear",
    onUpdate: () => {
      setHead(Math.floor(stream.at * total));
    },
  });

  return head;
};

/** How warm the cell at `index` is with `shown` cells out: 0 not yet out, 1 settled. */
export const warmthAt = (index: number, shown: number) =>
  index >= shown ? 0 : Math.min(1, (shown - index) / FRESH_CELLS);

export interface Run {
  readonly text: string;
  readonly fg: string;
}

/** Cells as runs of one color each, the newest warming up from `ground` to `settled`. */
export const inkRuns = (
  cells: readonly string[],
  shown: number,
  ground: string,
  settled: string,
): readonly Run[] => {
  const runs: Run[] = [];

  for (const [index, cell] of cells.entries()) {
    const fg = mixHex(ground, settled, warmthAt(index, shown));
    const last = runs.at(-1);

    if (last?.fg === fg) runs[runs.length - 1] = { text: last.text + cell, fg };
    else runs.push({ text: cell, fg });
  }

  return runs;
};

/** Where the word being written ends: the next blank at or after `shown`. */
const wordEndOf = (cells: readonly string[], shown: number) => {
  const next = cells.findIndex((cell, index) => index >= shown && /\s/.test(cell));

  return next === -1 ? cells.length : next;
};

/** A paragraph with `shown` of its cells out, wrapping as it will once all of it is. */
export function Inked(props: {
  readonly text: string;
  readonly shown: number;
  readonly role: RoleName;
}) {
  const color = useColor();

  const runs = () => {
    const cells = cellsOf(props.text);

    return inkRuns(
      cells.slice(0, wordEndOf(cells, props.shown)),
      props.shown,
      color("surface.base"),
      color(props.role),
    );
  };

  return (
    <text>
      <For each={runs()}>{(run) => <span style={{ fg: run.fg }}>{run.text}</span>}</For>
    </text>
  );
}
