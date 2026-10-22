/**
 * The commands matching what follows a typed `/`, on a raised panel just above the draft so its
 * chevron is not mistaken for the draft's. With nothing after the `/` every command shows in order;
 * after it, `fuzzysort` orders them by match and marks the matched letters. Names sit in one column
 * as wide as the longest name, so descriptions stay put while the user types.
 */

import fuzzysort from "fuzzysort";
import { For, Show } from "solid-js";

import { ChoiceRow, labelColumnsOf } from "../../primitives/ChoiceRow.tsx";
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

  return (
    <box marginBottom={1} backgroundColor={color("surface.raised")}>
      <Show
        when={rows().length > 0}
        fallback={<text fg={color("text.faint")}> No commands match</text>}
      >
        <scrollbox
          height={Math.min(rows().length, MENU_ROWS)}
          scrollbarOptions={{ visible: false }}
        >
          <For each={rows()}>
            {(row, index) => (
              <ChoiceRow
                label={`/${row.command.name}`}
                detail={row.command.description}
                matches={row.matches}
                labelColumns={columns()}
                isUnder={index() === props.under}
              />
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
