/**
 * The tags matching what follows a typed `@`, on a raised panel a row above the draft, as the
 * gallery's slash menu draws commands. Its pointer is a `➜`, not the draft's chevron, so the two
 * are not mistaken for each other. A line along the top edge of its first row tops the panel, and
 * its rows fade down into the composer's background. The row under the cursor stays in view.
 */

import type { BorderCharacters, ScrollBoxRenderable } from "@opentui/core";
import { createEffect, For, Show } from "solid-js";

import { kit, useColor, useMix } from "@shanepadgett/liminal-tui";

import type { Ranked } from "./tags.ts";

const MENU_ROWS = 8;

const MENU_POINTER = "➜";

/** A line along the top edge of its cells, so nothing shows above it. */
const EDGE = "▔";

const TOP_EDGE: BorderCharacters = {
  topLeft: EDGE,
  topRight: EDGE,
  bottomLeft: EDGE,
  bottomRight: EDGE,
  horizontal: EDGE,
  vertical: EDGE,
  topT: EDGE,
  bottomT: EDGE,
  leftT: EDGE,
  rightT: EDGE,
  cross: EDGE,
};

const rowId = (index: number) => `chat-tag-${index}`;

export const TAG_HINTS: readonly kit.Hint[] = [
  { keys: "↑↓", label: "choose" },
  { keys: "enter", label: "tag" },
  { keys: "tab", label: "open folder" },
  { keys: "esc", label: "close" },
];

export function TagMenu(props: {
  readonly rows: readonly Ranked[];
  /** The row under the cursor. */
  readonly under: number;
}) {
  const color = useColor();
  const mix = useMix();
  const columns = () => kit.labelColumnsOf(props.rows.map(({ row }) => `@${row.tag}`));
  const shown = () => Math.max(1, Math.min(props.rows.length, MENU_ROWS));
  let list: ScrollBoxRenderable | undefined;

  /** The raised surface under the line, nearly the composer's own at the last row shown. */
  const fadeOf = (row: number) =>
    mix(
      color("surface.raised"),
      color("surface.base"),
      (Math.min(row, shown() - 1) + 1) / (shown() + 1),
    );

  createEffect(() => {
    list?.scrollChildIntoView(rowId(props.under));
  });

  return (
    <box marginBottom={1}>
      <box
        height={1}
        border={["top"]}
        customBorderChars={TOP_EDGE}
        borderColor={color("border.base")}
        backgroundColor={color("surface.raised")}
      />
      <Show
        when={props.rows.length > 0}
        fallback={
          <box backgroundColor={fadeOf(0)}>
            <text fg={color("text.faint")}> No files match</text>
          </box>
        }
      >
        <scrollbox
          ref={(made) => {
            list = made;
          }}
          height={shown()}
          scrollbarOptions={{ visible: false }}
        >
          <For each={props.rows}>
            {(ranked, index) => (
              <box id={rowId(index())} backgroundColor={fadeOf(index())}>
                <kit.ChoiceRow
                  label={`@${ranked.row.tag}`}
                  matches={ranked.matches.map((at) => at + 1)}
                  labelColumns={columns()}
                  isUnder={index() === props.under}
                  pointer={MENU_POINTER}
                />
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </box>
  );
}
