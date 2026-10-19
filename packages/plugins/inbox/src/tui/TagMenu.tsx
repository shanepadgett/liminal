/**
 * The `@` list, opening upward from the composer on its surface: an emoji for each row's kind, its
 * path with the matched characters in the accent, and its note, such as a picture's size, on the
 * right.
 */

import { For, Show } from "solid-js";

import { matchIndices, matchRuns, useColor } from "@liminal/sdk/tui";

import type { TagKind, TagRow } from "../contract.ts";

/** Emoji that show as emoji by default, so each is two columns in every terminal. */
const ICONS: Readonly<Record<TagKind, string>> = {
  file: "📄",
  folder: "📁",
  reference: "📚",
  image: "🌄",
};

/** The most rows shown before the list scrolls. */
const MAX_ROWS = 10;

const noMatches: ReadonlySet<number> = new Set();

function TagLine(props: {
  readonly row: TagRow;
  readonly query: string;
  readonly isSelected: boolean;
}) {
  const color = useColor();
  const plain = () => color(props.isSelected ? "text.base" : "text.muted");
  const matches = () => matchIndices(props.query, props.row.path) ?? noMatches;

  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      gap={2}
      backgroundColor={props.isSelected ? color("surface.selected") : "transparent"}
    >
      <text flexGrow={1} flexShrink={1} wrapMode="none">
        <span>{`${ICONS[props.row.kind]} `}</span>
        <For each={matchRuns(props.row.path, matches())}>
          {(run) => (
            <span style={{ fg: run.matched ? color("text.accent") : plain() }}>{run.text}</span>
          )}
        </For>
      </text>
      <Show when={props.row.note}>
        {(note) => (
          <text flexShrink={0} fg={color("text.faint")}>
            {note()}
          </text>
        )}
      </Show>
    </box>
  );
}

export function TagMenu(props: {
  readonly rows: ReadonlyArray<TagRow>;
  readonly query: string;
  readonly selected: number;
}) {
  const color = useColor();

  return (
    <scrollbox
      height={Math.min(props.rows.length, MAX_ROWS)}
      flexShrink={0}
      marginBottom={1}
      backgroundColor={color("surface.raised")}
      scrollbarOptions={{ visible: false }}
    >
      <For each={props.rows}>
        {(row, index) => (
          <TagLine row={row} query={props.query} isSelected={index() === props.selected} />
        )}
      </For>
    </scrollbox>
  );
}
