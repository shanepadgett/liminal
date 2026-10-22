/** Text with the letters a filter matched picked out in the accent. */

import { For } from "solid-js";

import type { RoleName } from "../theme/roles.ts";
import { useColor } from "../theme/theme.tsx";

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
}) {
  const color = useColor();

  return (
    <text wrapMode="none">
      <For each={runsOf(props.text, new Set(props.matches))}>
        {(run) => (
          <span style={{ fg: color(run.isMatch ? "text.accent" : props.role), bold: run.isMatch }}>
            {run.text}
          </span>
        )}
      </For>
    </text>
  );
}
