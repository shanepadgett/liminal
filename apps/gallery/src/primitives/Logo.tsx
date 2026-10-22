/**
 * The big wordmark for the start of a session: "liminal" in block letters running through the
 * gradient, set in a field of diagonals that steps down to the right.
 */

import { For } from "solid-js";

import { useColor } from "../theme/theme.tsx";
import { cellsOf, gradientOf } from "./Gradient.tsx";
import { Hatch } from "./Hatch.tsx";

type Letterform = readonly [string, string, string];

/** Three rows of half blocks: an ascender row, then the x-height. */
const LETTERS: Readonly<Record<string, Letterform>> = {
  l: ["█", "█", "█"],
  i: ["▀", "█", "█"],
  m: ["     ", "█▀█▀▄", "█ █ █"],
  n: ["    ", "█▀▀▄", "█  █"],
  a: ["    ", "▀▀▀▄", "█▄▄█"],
};

const WORD = "liminal";

const ROWS = [0, 1, 2] as const;

const rowOf = (row: 0 | 1 | 2) =>
  cellsOf(WORD)
    .map((letter) => LETTERS[letter]?.[row] ?? "")
    .join(" ");

const LEFT_FIELD = "╱╱╱╱";

export function Logo() {
  const color = useColor();

  const cells = () =>
    gradientOf(color("gradient.from"), color("gradient.to"), cellsOf(rowOf(0)).length);

  return (
    <box flexShrink={0}>
      <For each={ROWS}>
        {(row) => (
          <box flexDirection="row" gap={2} marginRight={row}>
            <text flexShrink={0} fg={color("ornament")}>
              {LEFT_FIELD}
            </text>
            <text flexShrink={0} wrapMode="none">
              <For each={cellsOf(rowOf(row))}>
                {(cell, index) => <span style={{ fg: cells()[index()] ?? "" }}>{cell}</span>}
              </For>
            </text>
            <Hatch />
          </box>
        )}
      </For>
    </box>
  );
}
