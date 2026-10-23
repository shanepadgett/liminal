/**
 * How streaming text arrives: the newest characters start at the background color and warm up to
 * their own over the last few, so text surfaces rather than prints. The rest of the word being
 * written is laid out in the background color, so a word never jumps to the next line halfway. Text
 * arrives in bursts, so what shows writes out at its own steady pace, a little behind.
 */

import { useRenderer, useTimeline } from "@opentui/solid";
import { type Accessor, createEffect, createSignal, For, onCleanup, untrack } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";

import { useColor, useMix } from "../colors.ts";
import { cellsOf } from "./Gradient.tsx";

/** Characters this close behind the newest one are still warming up. */
export const FRESH_CELLS = 24;

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

/** How fast a live stream writes once it has caught up with what has arrived. */
const LIVE_CELLS_PER_SECOND = 200;

/** About how far a live stream lets itself fall behind before it writes faster. */
const MOST_BEHIND_SECONDS = 0.5;

/**
 * How many of `length()` cells to show while they stream in: a head that moves on every frame at a
 * steady pace, faster the further behind it is. Once `isLive()` turns false it writes out the rest
 * and lets it warm up, then is undefined: settled. Undefined from the start when it was never
 * live.
 */
export const useInkHead = (
  length: Accessor<number>,
  isLive: Accessor<boolean>,
): Accessor<number | undefined> => {
  const renderer = useRenderer();
  const [shown, setShown] = createSignal(isLive() ? 0 : undefined);
  // Where the head is, between cells, and the frame it waits for while it is behind.
  let head = 0;
  let frame: number | undefined;

  const target = () => (isLive() ? length() : length() + FRESH_CELLS);

  const step = (milliseconds: number) => {
    frame = undefined;

    const pace = Math.max(LIVE_CELLS_PER_SECOND, (target() - head) / MOST_BEHIND_SECONDS);

    head = Math.min(target(), head + (pace * milliseconds) / 1000);

    if (head >= target() && !isLive()) {
      setShown(undefined);

      return;
    }

    setShown(Math.floor(head));

    if (head < target()) frame = renderer.requestAnimationFrame(step);
  };

  // New text, or the stream ending, wakes a head that has caught up.
  createEffect(() => {
    target();

    if (untrack(shown) !== undefined && frame === undefined) {
      frame = renderer.requestAnimationFrame(step);
    }
  });

  onCleanup(() => {
    if (frame !== undefined) renderer.cancelAnimationFrame(frame);
  });

  return shown;
};

/** Eases a warmth from 0 to 1, slow at both ends, so the newest cells fade in softly. */
const eased = (warmth: number) => warmth * warmth * (3 - 2 * warmth);

/** How warm the cell at `index` is with `shown` cells out: 0 not yet out, 1 settled. */
export const warmthAt = (index: number, shown: number) =>
  index >= shown ? 0 : eased(Math.min(1, (shown - index) / FRESH_CELLS));

export interface Run {
  readonly text: string;
  readonly fg: string;
}

/**
 * Cells as runs of one color each, the newest warming up: `tint` gives the color at a warmth, from
 * 0 for the ground to 1 for settled.
 */
export const inkRuns = (
  cells: readonly string[],
  shown: number,
  tint: (warmth: number) => string,
): readonly Run[] => {
  const runs: Run[] = [];

  for (const [index, cell] of cells.entries()) {
    const fg = tint(warmthAt(index, shown));
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
  const mix = useMix();

  const runs = () => {
    const cells = cellsOf(props.text);

    return inkRuns(cells.slice(0, wordEndOf(cells, props.shown)), props.shown, (warmth) =>
      mix(color("surface.base"), color(props.role), warmth),
    );
  };

  return (
    <text>
      <For each={runs()}>{(run) => <span style={{ fg: run.fg }}>{run.text}</span>}</For>
    </text>
  );
}
