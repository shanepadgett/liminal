/** Keeps a one-row-per-item list's highlighted row in view as the highlight moves. */

import type { ScrollBoxRenderable } from "@opentui/core";
import { createEffect } from "solid-js";

/** Returns the list's `ref`: it scrolls just enough to show row `selected()`. */
export const useReveal = (selected: () => number) => {
  let list: ScrollBoxRenderable | undefined;

  const reveal = () => {
    const row = selected();
    if (list === undefined) return;
    const height = list.viewport.height;

    if (row < list.scrollTop) list.scrollTop = row;
    else if (row + 1 > list.scrollTop + height) list.scrollTop = row + 1 - height;
  };

  createEffect(reveal);

  return (made: ScrollBoxRenderable) => {
    list = made;
    // The list cannot scroll until its height is known, so the first reveal waits for it.
    made.content.on("resize", reveal);
  };
};
