/**
 * How far a streaming text's ink is out. Text arrives in bursts, so the head chases what has
 * arrived at a steady pace and runs past the end by the fade's length, so text that stops arriving
 * warms up all the way.
 */

import { type Accessor, createEffect, createSignal, on, onCleanup } from "solid-js";

import { FRESH_CHARS } from "@liminal/sdk/tui";

/** Milliseconds between steps of the head. */
const STEP_MS = 40;

/** Each step closes this fraction of the gap, so a burst catches up in a few steps. */
const CATCH_UP = 1 / 6;

/** The fewest characters a step moves. */
const MIN_STEP = 2;

/** The next head on the way to `target`. */
const stepTo = (head: number, target: number) =>
  Math.min(target, head + Math.max(MIN_STEP, Math.ceil((target - head) * CATCH_UP)));

/** The ink's head over `text`, starting over when the text is replaced rather than extended. */
export const createHead = (text: Accessor<string>): Accessor<number> => {
  const [head, setHead] = createSignal(0);
  let previous = "";

  createEffect(
    on(text, (now) => {
      if (!now.startsWith(previous)) setHead(0);
      previous = now;
    }),
  );

  const timer = setInterval(() => {
    const target = text().length + FRESH_CHARS;
    if (head() < target) setHead(stepTo(head(), target));
  }, STEP_MS);

  onCleanup(() => {
    clearInterval(timer);
  });

  return head;
};
