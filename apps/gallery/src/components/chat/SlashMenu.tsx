/**
 * The commands matching what follows a typed `/`, on a raised panel a row above the draft. Its
 * pointer is a `➜`, not the draft's chevron, so the two are not mistaken for each other. A line
 * along the top edge of its first row tops the panel, and its rows fade down into the composer's
 * background. With nothing after the `/` every command shows in order; after it, `fuzzysort` orders
 * them by match and marks the matched letters. Names sit in one column as wide as the longest name,
 * so descriptions stay put while the user types.
 */

import type { BorderCharacters } from "@opentui/core";
import fuzzysort from "fuzzysort";
import { For, Show } from "solid-js";

import { ChoiceRow, labelColumnsOf } from "../../primitives/ChoiceRow.tsx";
import { mixHex } from "../../theme/oklch.ts";
import { useColor } from "../../theme/theme.tsx";

export interface SlashCommand {
  /** Without its `/`. */
  readonly name: string;
  readonly description: string;
}

interface Match {
  readonly command: SlashCommand;
  /** Indexes into the name as shown, `/` included. */
  readonly matches: readonly number[];
}

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

const matchesOf = (commands: readonly SlashCommand[], typed: string): readonly Match[] =>
  typed === ""
    ? commands.map((command) => ({ command, matches: [] }))
    : fuzzysort
        .go(typed, commands, { key: "name" })
        .map((result) => ({
          command: result.obj,
          matches: result.indexes.map((index) => index + 1),
        }));

export function SlashMenu(props: {
  readonly commands: readonly SlashCommand[];
  /** What follows the `/`. */
  readonly typed: string;
  /** The row under the cursor. */
  readonly under: number;
}) {
  const color = useColor();
  const rows = () => matchesOf(props.commands, props.typed);
  const columns = () => labelColumnsOf(props.commands.map((command) => `/${command.name}`));
  const shown = () => Math.max(1, Math.min(rows().length, MENU_ROWS));

  /** The raised surface under the line, nearly the composer's own at the last row shown. */
  const fadeOf = (row: number) =>
    mixHex(
      color("surface.raised"),
      color("surface.base"),
      (Math.min(row, shown() - 1) + 1) / (shown() + 1),
    );

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
        when={rows().length > 0}
        fallback={
          <box backgroundColor={fadeOf(0)}>
            <text fg={color("text.faint")}> No commands match</text>
          </box>
        }
      >
        <scrollbox
          height={Math.min(rows().length, MENU_ROWS)}
          scrollbarOptions={{ visible: false }}
        >
          <For each={rows()}>
            {(row, index) => (
              <box backgroundColor={fadeOf(index())}>
                <ChoiceRow
                  label={`/${row.command.name}`}
                  detail={row.command.description}
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

export const SLASH_HINTS = [
  { keys: "↑↓", label: "choose" },
  { keys: "tab", label: "complete" },
  { keys: "enter", label: "run" },
  { keys: "esc", label: "close" },
];
