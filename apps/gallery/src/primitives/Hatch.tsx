/**
 * A field of diagonals, the gallery's ornament. With a width it runs the gradient end to end;
 * without one it fills the rest of its row in one quiet color.
 */

import { For, Show } from "solid-js";

import { useColor } from "../theme/theme.tsx";
import { gradientOf } from "./Gradient.tsx";

const DIAGONAL = "╱";

/** Wider than any terminal, so a filling hatch always reaches the edge. */
const FILL_CELLS = 400;

export function Hatch(props: { readonly width?: number }) {
  const color = useColor();

  return (
    <Show
      when={props.width}
      fallback={
        <box flexGrow={1} flexShrink={1} flexBasis={0} height={1} overflow="hidden">
          <text wrapMode="none" fg={color("ornament")}>
            {DIAGONAL.repeat(FILL_CELLS)}
          </text>
        </box>
      }
    >
      {(width) => (
        <text flexShrink={0} wrapMode="none">
          <For each={gradientOf(color("gradient.from"), color("gradient.to"), width())}>
            {(fg) => <span style={{ fg }}>{DIAGONAL}</span>}
          </For>
        </text>
      )}
    </Show>
  );
}
