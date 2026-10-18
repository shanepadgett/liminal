/**
 * The commands matching what follows a typed `/`, opening upward from the composer on its surface:
 * each slash name with the matched characters in the accent, then what the command does. Names sit
 * in one column as wide as the longest, so descriptions line up.
 */

import { For } from "solid-js";

import {
  type Command,
  type ListedCommand,
  matchIndices,
  matchRuns,
  useColor,
} from "@liminal/sdk/tui";

/** A slash command whose name or an alias holds the typed text in order. */
export interface SlashMatch {
  readonly command: Command;
  readonly name: string;
  /** Indices in `name` the typed text matched; empty when only an alias matched. */
  readonly matches: ReadonlySet<number>;
}

/** The most rows shown before the menu scrolls. */
const MAX_ROWS = 10;

const noMatches: ReadonlySet<number> = new Set();

/** The word being typed when the draft is `/word` with nothing after it; otherwise none. */
export const slashWord = (draft: string) => /^\/(\S*)$/.exec(draft)?.[1];

const matchOf = (command: Command, typed: string): SlashMatch | undefined => {
  if (command.slash === undefined) return undefined;
  const name = `/${command.slash.name}`;
  const matches = matchIndices(`/${typed}`, name);
  if (matches !== undefined) return { command, name, matches };

  const byAlias = (command.slash.aliases ?? []).some(
    (alias) => matchIndices(typed, alias) !== undefined,
  );

  return byAlias ? { command, name, matches: noMatches } : undefined;
};

/** The slash commands matching `typed`, the word after `/`. */
export const slashMatches = (listed: ReadonlyArray<ListedCommand>, typed: string) =>
  listed.flatMap(({ command }) => {
    const match = matchOf(command, typed);

    return match === undefined ? [] : [match];
  });

function SlashRow(props: {
  readonly match: SlashMatch;
  readonly columns: number;
  readonly isSelected: boolean;
}) {
  const color = useColor();
  const plain = () => color(props.isSelected ? "text.base" : "text.muted");

  return (
    <box
      flexDirection="row"
      height={1}
      marginX={-1}
      paddingX={1}
      backgroundColor={props.isSelected ? color("surface.selected") : "transparent"}
    >
      <text width={props.columns} flexShrink={0} wrapMode="none">
        <For each={matchRuns(props.match.name, props.match.matches)}>
          {(run) => (
            <span style={{ fg: run.matched ? color("text.accent") : plain() }}>{run.text}</span>
          )}
        </For>
      </text>
      <text
        flexGrow={1}
        flexShrink={1}
        wrapMode="none"
        fg={color(props.isSelected ? "text.muted" : "text.faint")}
      >
        {props.match.command.desc ?? props.match.command.title}
      </text>
    </box>
  );
}

export function SlashMenu(props: {
  readonly matches: ReadonlyArray<SlashMatch>;
  readonly selected: number;
}) {
  const color = useColor();
  const columns = () => Math.max(...props.matches.map((match) => match.name.length)) + 2;

  return (
    <scrollbox
      height={Math.min(props.matches.length, MAX_ROWS)}
      flexShrink={0}
      marginBottom={1}
      backgroundColor={color("surface.raised")}
      scrollbarOptions={{ visible: false }}
    >
      <For each={props.matches}>
        {(match, index) => (
          <SlashRow match={match} columns={columns()} isSelected={index() === props.selected} />
        )}
      </For>
    </scrollbox>
  );
}
