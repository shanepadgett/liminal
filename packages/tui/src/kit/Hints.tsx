/** Key hints: `enter select esc close`. */

import { For } from "solid-js";

import { useColor } from "../colors.ts";

export interface Hint {
  readonly keys: string;
  readonly label: string;
}

export function Hints(props: { readonly hints: readonly Hint[] }) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <For each={props.hints}>
        {(hint, index) => (
          <>
            <span style={{ fg: color("text.muted") }}>
              {(index() === 0 ? "" : "   ") + hint.keys}
            </span>
            <span style={{ fg: color("text.faint") }}>{` ${hint.label}`}</span>
          </>
        )}
      </For>
    </text>
  );
}
