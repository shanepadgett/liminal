/**
 * A suggestion's text with the characters the query matched in the accent color. Text wider than
 * its columns loses its middle to `…`, and the matches either side of the cut stay marked.
 */

import { For } from "solid-js";

import type { RoleColor } from "@liminal/sdk/tui";

import { ELLIPSIS, middleCut } from "./middleCut.ts";

type Run = { readonly text: string; readonly kind: "match" | "plain" | "cut" };

/** Neighboring characters from `start` to `end` that share a kind, joined into runs. */
const runsBetween = (
  text: string,
  matches: ReadonlySet<number>,
  start: number,
  end: number,
): Run[] => {
  const runs: Run[] = [];

  for (let index = start; index < end; index += 1) {
    const kind = matches.has(index) ? "match" : "plain";
    const last = runs.at(-1);

    if (last?.kind === kind) {
      runs[runs.length - 1] = { text: last.text + text.charAt(index), kind };
    } else {
      runs.push({ text: text.charAt(index), kind });
    }
  }

  return runs;
};

/** Paths and command names are plain text, so each UTF-16 unit is one column. */
const runsOf = (text: string, matches: ReadonlySet<number>, columns: number): readonly Run[] => {
  const cut = middleCut(text.length, columns);

  if (cut === undefined) {
    return runsBetween(text, matches, 0, text.length);
  }

  return [
    ...runsBetween(text, matches, 0, cut.head),
    { text: ELLIPSIS, kind: "cut" },
    ...runsBetween(text, matches, text.length - cut.tail, text.length),
  ];
};

export function MatchedText(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly matches: ReadonlySet<number>;
  readonly columns: number;
  readonly isSelected: boolean;
}) {
  const fg = (kind: Run["kind"]) => {
    if (kind === "match") {
      return props.color("text.accent");
    }

    if (kind === "cut") {
      return props.color("text.faint");
    }

    return props.color(props.isSelected ? "text.base" : "text.muted");
  };

  return (
    <text wrapMode="none" flexShrink={0}>
      <For each={runsOf(props.text, props.matches, props.columns)}>
        {(run) => <span style={{ fg: fg(run.kind) }}>{run.text}</span>}
      </For>
    </text>
  );
}
