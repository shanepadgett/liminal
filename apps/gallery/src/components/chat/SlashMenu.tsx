/**
 * The commands matching what follows a typed `/`, on a raised panel a row above the draft. Its
 * pointer is a `➜`, not the draft's chevron, so the two are not mistaken for each other. A line
 * along the top edge of its first row tops the panel, and its rows fade down into the composer's
 * background. With nothing after the `/` every command shows in order; after it, `fuzzysort` orders
 * them by match and marks the matched letters. A command that takes text shows it dimmed after its
 * name: `[hint]` when the text is optional, `<hint>` when it is required. Names sit in one column
 * as wide as the longest, so titles stay put while the user types.
 */

import type { BorderCharacters } from "@opentui/core";
import fuzzysort from "fuzzysort";
import { For, Show } from "solid-js";

import { ChoiceRow, labelColumnsOf } from "../../primitives/ChoiceRow.tsx";
import { mixHex } from "../../theme/oklch.ts";
import { useColor } from "../../theme/theme.tsx";

/** The text a command takes after its name. */
export interface SlashArgument {
  readonly kind: "optional" | "required";
  readonly hint: string;
}

export interface SlashCommand {
  /** Without its `/`. */
  readonly name: string;
  readonly title: string;
  readonly argument?: SlashArgument;
}

interface Row {
  readonly label: string;
  readonly suffix?: string;
  readonly title: string;
  /** Indexes into the label, `/` included. */
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

const suffixOf = (argument: SlashArgument) =>
  argument.kind === "optional" ? `[${argument.hint}]` : `<${argument.hint}>`;

const rowOf = (command: SlashCommand, matches: readonly number[]): Row => {
  const row = { label: `/${command.name}`, title: command.title, matches };

  return command.argument === undefined ? row : { ...row, suffix: suffixOf(command.argument) };
};

const rowsOf = (commands: readonly SlashCommand[], typed: string): readonly Row[] =>
  typed === ""
    ? commands.map((command) => rowOf(command, []))
    : fuzzysort.go(typed, commands, { key: "name" }).map((result) =>
        rowOf(
          result.obj,
          result.indexes.map((index) => index + 1),
        ),
      );

/** What a row's label column holds: the label and its dimmed suffix. */
const labelOf = (row: Row) => (row.suffix === undefined ? row.label : `${row.label} ${row.suffix}`);

export function SlashMenu(props: {
  readonly commands: readonly SlashCommand[];
  /** What follows the `/`. */
  readonly typed: string;
  /** The row under the cursor. */
  readonly under: number;
}) {
  const color = useColor();
  const rows = () => rowsOf(props.commands, props.typed);
  const columns = () => labelColumnsOf(rows().map(labelOf));
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
        <scrollbox height={shown()} scrollbarOptions={{ visible: false }}>
          <For each={rows()}>
            {(row, index) => (
              <box backgroundColor={fadeOf(index())}>
                <ChoiceRow
                  label={row.label}
                  suffix={row.suffix}
                  detail={row.title}
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
