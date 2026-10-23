/**
 * The rows a draft trigger offers, such as tags after `@` or commands after `/`, on a raised panel
 * a row above the draft, as the gallery's slash menu draws them. Its pointer is a `➜`, not the
 * draft's chevron, so the two are not mistaken for each other. A line along the top edge of its
 * first row tops the panel, and its rows fade down into the composer's background. The row under
 * the cursor stays in view.
 */

import type { BorderCharacters, ScrollBoxRenderable } from "@opentui/core";
import { createEffect, For, Show } from "solid-js";

import { kit, useColor, useMix } from "@shanepadgett/liminal-tui";

import type { DraftRow } from "./triggers.ts";

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

const rowId = (index: number) => `chat-menu-${index}`;

/** The line that tops the panel. */
function TopEdge() {
  const color = useColor();

  return (
    <box
      height={1}
      border={["top"]}
      customBorderChars={TOP_EDGE}
      borderColor={color("border.base")}
      backgroundColor={color("surface.raised")}
    />
  );
}

export function DraftMenu(props: {
  readonly rows: ReadonlyArray<DraftRow>;
  /** Shown when no row matches. */
  readonly empty: string;
  /** The row under the cursor. */
  readonly under: number;
}) {
  const color = useColor();
  const mix = useMix();
  const columns = () => kit.labelColumnsOf(props.rows.map((row) => row.label));
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
      <TopEdge />
      <Show
        when={props.rows.length > 0}
        fallback={
          <box backgroundColor={fadeOf(0)}>
            <text fg={color("text.faint")}>{` ${props.empty}`}</text>
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
            {(row, index) => (
              <box id={rowId(index())} backgroundColor={fadeOf(index())}>
                <kit.ChoiceRow
                  label={row.label}
                  detail={row.detail}
                  matches={row.matches}
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
