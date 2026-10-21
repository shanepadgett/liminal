/**
 * A row of individually colored cells, as the ornament draws them. Cells update in place by
 * position, so an animation that redraws every frame keeps its spans.
 */

import { Index } from "solid-js";

import type { Cell } from "./fade.ts";

export function Cells(props: { readonly cells: readonly Cell[] }) {
  return (
    <text wrapMode="none">
      <Index each={props.cells}>
        {(cell) => <span style={{ fg: cell().fg, bg: cell().bg }}>{cell().glyph}</span>}
      </Index>
    </text>
  );
}
