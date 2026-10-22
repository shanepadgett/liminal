/** Text with the letters a filter matched picked out: bold, underlined and in their own color. */

import { For } from "solid-js";

import type { RoleName } from "@shanepadgett/liminal-client";

import { useColor } from "../colors.ts";

interface Run {
  readonly text: string;
  readonly isMatch: boolean;
}

/** Splits `text` into runs of matched and unmatched letters. */
const runsOf = (text: string, matches: ReadonlySet<number>): readonly Run[] => {
  const runs: Run[] = [];

  // fuzzysort counts UTF-16 units, so the loop walks the same units.
  for (let index = 0; index < text.length; index += 1) {
    const letter = text.charAt(index);
    const isMatch = matches.has(index);
    const last = runs.at(-1);

    if (last?.isMatch === isMatch) runs[runs.length - 1] = { text: last.text + letter, isMatch };
    else runs.push({ text: letter, isMatch });
  }

  return runs;
};

export function MatchedText(props: {
  readonly text: string;
  /** Indexes of the matched letters. */
  readonly matches: readonly number[];
  readonly role: RoleName;
  /** The matched letters' color; the accent unless the row sits on a fill. */
  readonly matchRole?: RoleName;
}) {
  const color = useColor();

  return (
    <text wrapMode="none">
      <For each={runsOf(props.text, new Set(props.matches))}>
        {(run) => (
          <span
            style={{
              fg: color(run.isMatch ? (props.matchRole ?? "text.accent") : props.role),
              bold: run.isMatch,
              underline: run.isMatch,
            }}
          >
            {run.text}
          </span>
        )}
      </For>
    </text>
  );
}
