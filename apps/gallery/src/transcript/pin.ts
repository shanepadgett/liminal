/**
 * Which turn's prompt is pinned to the top of a scrolled conversation, and how far the next prompt
 * pushes it up. A prompt is pinned once it scrolls above the top of the view, until the next prompt
 * arrives and pushes it out row for row, so the two never overlap.
 */

import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core";
import { createSignal } from "solid-js";

/** The last turn whose prompt has scrolled above the top of the view. */
const pinnedTurnIndex = (
  prompts: ReadonlyMap<number, BoxRenderable>,
  viewTop: number,
): number | undefined => {
  let pinned: number | undefined;

  for (const [index, prompt] of prompts) {
    if (prompt.y < viewTop && (pinned === undefined || index > pinned)) pinned = index;
  }

  return pinned;
};

/**
 * How far the next prompt pushes the pinned one up: nothing until the next prompt's top reaches the
 * pinned prompt's bottom, then row for row.
 */
const pushOf = (
  prompts: ReadonlyMap<number, BoxRenderable>,
  pinned: number | undefined,
  viewTop: number,
): number => {
  if (pinned === undefined) return 0;

  const current = prompts.get(pinned);
  const next = prompts.get(pinned + 1);
  if (current === undefined || next === undefined) return 0;

  return Math.max(0, current.height - (next.y - viewTop));
};

/**
 * Tracks the pin. A wheel scroll bubbles up from the scrollbox after it has moved, so `onScroll`
 * updates the pin before the next frame and the two move together. Other moves (sticky scroll to
 * the bottom, a prompt opening, a turn growing) are caught by `check` as each frame is drawn, and
 * set after that frame, since changing the tree mid-draw is not safe.
 */
export const createPin = () => {
  const [pinnedIndex, setPinnedIndex] = createSignal<number>();
  const [push, setPush] = createSignal(0);
  const [scroll, setScroll] = createSignal<ScrollBoxRenderable>();
  const prompts = new Map<number, BoxRenderable>();

  const update = () => {
    const view = scroll();
    if (view === undefined) return;

    const index = pinnedTurnIndex(prompts, view.viewport.y);
    setPinnedIndex(index);
    setPush(pushOf(prompts, index, view.viewport.y));
  };

  const check = () => {
    const view = scroll();
    if (view === undefined) return;

    const index = pinnedTurnIndex(prompts, view.viewport.y);
    const nextPush = pushOf(prompts, index, view.viewport.y);

    if (index !== pinnedIndex() || nextPush !== push()) queueMicrotask(update);
  };

  return { pinnedIndex, push, setScroll, prompts, check, onScroll: update };
};
