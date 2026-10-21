/**
 * The commands that match what follows a typed `/`: each command's name, with the matched
 * characters marked, and what it does. Names sit in one column as wide as the longest name, so the
 * descriptions line up and stay put while the user types.
 */

import { For } from "solid-js";

import { matchIndices, type RoleColor } from "@liminal/sdk/tui";

import { ListRow } from "./ListRow.tsx";
import { MatchedText } from "./MatchedText.tsx";
import { SuggestionList } from "./SuggestionList.tsx";

type SlashCommand = { readonly name: string; readonly description: string };

const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "/new", description: "Start a fresh session" },
  { name: "/sessions", description: "Switch to another session" },
  { name: "/compact", description: "Summarize the conversation to free context" },
  { name: "/context", description: "Show what fills the context window" },
  { name: "/copy", description: "Copy the last reply" },
  { name: "/cost", description: "Show what this session has cost" },
  { name: "/model", description: "Switch the model" },
  { name: "/thinking", description: "Set the thinking level" },
  { name: "/review", description: "Review the changes on this branch" },
  { name: "/init", description: "Write an AGENTS.md for this project" },
  { name: "/export", description: "Save the session as Markdown" },
  { name: "/theme", description: "Change the theme" },
  { name: "/help", description: "Show keys and commands" },
  { name: "/quit", description: "Quit Liminal" },
];

/** The longest name and two columns of space. */
const NAME_COLUMNS = Math.max(...SLASH_COMMANDS.map((command) => command.name.length)) + 2;

/** The commands that match `typed`, which includes its `/`. */
const matching = (typed: string) =>
  SLASH_COMMANDS.flatMap((command) => {
    const matches = matchIndices(typed, command.name);

    return matches === undefined ? [] : [{ command, matches }];
  });

export function CommandSuggestions(props: {
  readonly color: RoleColor;
  readonly surface: string;
  readonly typed: string;
}) {
  const rows = () => matching(props.typed);

  return (
    <SuggestionList surface={props.surface} count={rows().length}>
      {() => (
        <For each={rows()}>
          {(row, index) => (
            <ListRow color={props.color} isSelected={index() === 0}>
              <box width={NAME_COLUMNS} flexShrink={0}>
                <MatchedText
                  color={props.color}
                  text={row.command.name}
                  matches={row.matches}
                  columns={NAME_COLUMNS}
                  isSelected={index() === 0}
                />
              </box>
              <text
                flexGrow={1}
                flexShrink={1}
                wrapMode="none"
                fg={props.color(index() === 0 ? "text.muted" : "text.faint")}
              >
                {row.command.description}
              </text>
            </ListRow>
          )}
        </For>
      )}
    </SuggestionList>
  );
}
