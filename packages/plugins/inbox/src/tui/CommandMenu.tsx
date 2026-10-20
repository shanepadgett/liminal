/**
 * The commands matching what follows a typed `/`, opening upward from the composer on its surface:
 * each slash name with the matched characters in the accent, then what the command does. Names sit
 * in one column as wide as the longest, so descriptions line up. The list scrolls to keep the
 * highlight in view.
 */

import fuzzysort from "fuzzysort";
import { For } from "solid-js";

import { type Command, type ListedCommand, matchRuns, useColor } from "@liminal/sdk/tui";

import { useReveal } from "./reveal.ts";

/** A command whose name or an alias holds the typed text in order. */
export interface CommandMatch {
  readonly command: Command;
  readonly name: string;
  /** Indices in `name` the typed text matched; empty when only an alias matched. */
  readonly matches: ReadonlySet<number>;
}

/** The most rows shown before the menu scrolls. */
const MAX_ROWS = 10;

const noMatches: ReadonlySet<number> = new Set();

/** The word being typed when the draft is `/word` with nothing after it; otherwise none. */
export const commandWord = (draft: string) => /^\/(\S*)$/.exec(draft)?.[1];

interface RankedCommandMatch extends CommandMatch {
  readonly score: number;
  readonly isExact: boolean;
}

const matchOf = (command: Command, typed: string): RankedCommandMatch | null => {
  if (command.slash === undefined) return null;
  const name = `/${command.slash.name}`;

  if (typed === "") return { command, name, matches: new Set([0]), score: 0, isExact: false };

  const names = [command.slash.name, ...(command.slash.aliases ?? [])];

  const results = names.flatMap((word) => {
    const result = fuzzysort.single(typed, word);

    return result === null ? [] : [result];
  });

  if (results.length === 0) return null;

  const result = fuzzysort.single(typed, command.slash.name);

  const matches =
    result === null ? noMatches : new Set([0, ...result.indexes.map((index) => index + 1)]);

  return {
    command,
    name,
    matches,
    score: Math.max(...results.map((found) => found.score)),
    isExact: names.some((word) => word.toLowerCase() === typed.toLowerCase()),
  };
};

/** Exact names and aliases first, then fuzzy relevance; ties keep registry order. */
export const commandMatches = (listed: ReadonlyArray<ListedCommand>, typed: string) =>
  listed
    .flatMap(({ command }) => {
      const match = matchOf(command, typed);

      return match === null ? [] : [match];
    })
    .toSorted((a, b) => Number(b.isExact) - Number(a.isExact) || b.score - a.score);

function CommandRow(props: {
  readonly match: CommandMatch;
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

export function CommandMenu(props: {
  readonly matches: ReadonlyArray<CommandMatch>;
  readonly selected: number;
}) {
  const color = useColor();
  const columns = () => Math.max(...props.matches.map((match) => match.name.length)) + 2;
  const ref = useReveal(() => props.selected);

  return (
    <scrollbox
      ref={ref}
      height={Math.min(props.matches.length, MAX_ROWS)}
      flexShrink={0}
      marginBottom={1}
      backgroundColor={color("surface.raised")}
      scrollbarOptions={{ visible: false }}
    >
      <For each={props.matches}>
        {(match, index) => (
          <CommandRow match={match} columns={columns()} isSelected={index() === props.selected} />
        )}
      </For>
    </scrollbox>
  );
}
