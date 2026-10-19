/**
 * Which prompt is pinned to the top of a scrolled conversation, and how far the next prompt pushes
 * it up. A prompt is pinned once it scrolls above the top of the view, until the next prompt
 * arrives and pushes it out row for row, so the two never overlap.
 */

import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core";
import { createSignal } from "solid-js";

/** The drawn prompts, by their place in the conversation; any increasing numbers will do. */
type Prompts = ReadonlyMap<number, BoxRenderable>;

/** The last prompt that has scrolled above the top of the view. */
const pinnedOf = (prompts: Prompts, viewTop: number): number | undefined => {
  let pinned: number | undefined;

  for (const [index, prompt] of prompts) {
    if (prompt.y < viewTop && (pinned === undefined || index > pinned)) pinned = index;
  }

  return pinned;
};

/** The first prompt after `pinned`. */
const nextOf = (prompts: Prompts, pinned: number): BoxRenderable | undefined => {
  let next: number | undefined;

  for (const index of prompts.keys()) {
    if (index > pinned && (next === undefined || index < next)) next = index;
  }

  return next === undefined ? undefined : prompts.get(next);
};

/**
 * How far the next prompt pushes the pinned one up: nothing until the next prompt's top reaches the
 * pinned prompt's bottom, then row for row.
 */
const pushOf = (prompts: Prompts, pinned: number | undefined, viewTop: number): number => {
  if (pinned === undefined) return 0;

  const current = prompts.get(pinned);
  const next = nextOf(prompts, pinned);
  if (current === undefined || next === undefined) return 0;

  return Math.max(0, current.height - (next.y - viewTop));
};

/**
 * Tracks the pin. A wheel scroll bubbles up from the scrollbox after it has moved, so `onScroll`
 * updates the pin before the next frame and the two move together. Other moves (sticky scroll to
 * the bottom, a prompt opening, a reply growing) are caught by `check` as each frame is drawn, and
 * set after that frame, since changing the tree mid-draw is not safe.
 */
export const createPin = () => {
  const [pinned, setPinned] = createSignal<number>();
  const [push, setPush] = createSignal(0);
  const [scroll, setScroll] = createSignal<ScrollBoxRenderable>();
  const prompts = new Map<number, BoxRenderable>();

  const update = () => {
    const view = scroll();
    if (view === undefined) return;

    const index = pinnedOf(prompts, view.viewport.y);
    setPinned(index);
    setPush(pushOf(prompts, index, view.viewport.y));
  };

  const check = () => {
    const view = scroll();
    if (view === undefined) return;

    const index = pinnedOf(prompts, view.viewport.y);

    if (index !== pinned() || pushOf(prompts, index, view.viewport.y) !== push()) {
      queueMicrotask(update);
    }
  };

  return { pinned, push, setScroll, prompts, check, onScroll: update };
};
