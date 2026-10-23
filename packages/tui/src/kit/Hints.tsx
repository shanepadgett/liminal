/** Key hints: `enter select esc close`. */

import { For } from "solid-js";

import { useColor } from "../colors.ts";

export interface Hint {
  readonly keys: string;
  readonly label: string;
}

const GAP = "   ";

/** The leading hints that fit in `columns` whole; all of them without a width. */
const fitting = (hints: readonly Hint[], columns: number | undefined): readonly Hint[] => {
  if (columns === undefined) return hints;

  let used = -GAP.length;
  const shown: Hint[] = [];

  for (const hint of hints) {
    used += GAP.length + hint.keys.length + 1 + hint.label.length;
    if (used > columns) break;
    shown.push(hint);
  }

  return shown;
};

/** With `columns`, hints that would not fit in it are left off the end. */
export function Hints(props: {
  readonly hints: readonly Hint[];
  readonly columns?: number | undefined;
}) {
  const color = useColor();

  return (
    <text flexShrink={0}>
      <For each={fitting(props.hints, props.columns)}>
        {(hint, index) => (
          <>
            <span style={{ fg: color("text.muted") }}>
              {(index() === 0 ? "" : GAP) + hint.keys}
            </span>
            <span style={{ fg: color("text.faint") }}>{` ${hint.label}`}</span>
          </>
        )}
      </For>
    </text>
  );
}
