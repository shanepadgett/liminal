/** The last lines of some output, faint, under a work row. */

import { For } from "solid-js";

import { useColor } from "./theme.ts";

/** Shows the last `lines` lines of `text`. */
export function Tail(props: { readonly text: string; readonly lines: number }) {
  const color = useColor();
  const shown = () => props.text.trimEnd().split("\n").slice(-props.lines);

  return (
    <box flexDirection="column">
      <For each={shown()}>
        {(line) => (
          <text wrapMode="none" fg={color("text.faint")}>
            {line}
          </text>
        )}
      </For>
    </box>
  );
}
