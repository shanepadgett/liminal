/** Labeled rows of ANSI color swatches under a header naming the eight colors. */

import { For } from "solid-js";

import { CHROME } from "../shell/chrome.ts";
import { ANSI_NAMES } from "./terminal-palette.ts";

const SWATCH = "    ";

const LABEL_COLUMNS = 10;

export function AnsiHeader() {
  return (
    <text fg={CHROME.faint}>
      {" ".repeat(LABEL_COLUMNS) + ANSI_NAMES.map((name) => name.slice(0, 4).padEnd(5)).join("")}
    </text>
  );
}

/** One row, with `??` where a color is unknown. */
export function AnsiRow(props: {
  readonly label: string;
  readonly hexes: readonly (string | null)[];
}) {
  return (
    <text>
      <span style={{ fg: CHROME.muted }}>{props.label.padEnd(LABEL_COLUMNS)}</span>
      <For each={props.hexes}>
        {(hex) => (
          <>
            <span style={{ bg: hex ?? CHROME.background }}>{hex === null ? " ?? " : SWATCH}</span>
            <span> </span>
          </>
        )}
      </For>
    </text>
  );
}
