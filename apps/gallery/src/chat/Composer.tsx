/**
 * Where the user writes. A full-width surface of its own holding the input and, right under it, the
 * model in the accent color with its thinking level. Its top row can glide while the agent works.
 * The key hints sit directly below the surface. A draft that is a `/` command, or that ends in an
 * `@` tag, opens a list of suggestions above the input.
 */

import { Match, Switch } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { CommandSuggestions } from "./CommandSuggestions.tsx";
import { FileSuggestions } from "./FileSuggestions.tsx";
import { type Hint, Hints } from "./Hints.tsx";
import { ScanLine } from "./ScanLine.tsx";

/** Which list a draft opens: commands for a lone `/` word, files for a trailing `@` word. */
type Suggesting = { readonly kind: "commands" | "files" | "none"; readonly typed: string };

const COMMAND_DRAFT = /^\/\S*$/;
const FILE_TAG = /(?:^|\s)@(\S*)$/;

const suggestingFor = (draft: string): Suggesting => {
  if (COMMAND_DRAFT.test(draft)) {
    return { kind: "commands", typed: draft };
  }

  const tag = FILE_TAG.exec(draft);

  return tag === null ? { kind: "none", typed: "" } : { kind: "files", typed: tag[1] ?? "" };
};

const SUGGESTION_HINTS: Readonly<Record<"commands" | "files", readonly Hint[]>> = {
  commands: [
    ["↑↓", "choose"],
    ["tab", "complete"],
    ["enter", "run"],
    ["esc", "close"],
  ],
  files: [
    ["↑↓", "choose"],
    ["tab", "tag"],
    ["esc", "close"],
  ],
};

/**
 * What the keys do: an open list's keys first, else what fits whether the agent is working and
 * whether there is a draft.
 */
const hintsFor = (
  suggesting: Suggesting,
  isWorking: boolean,
  hasDraft: boolean,
): readonly Hint[] => {
  if (suggesting.kind !== "none") {
    return SUGGESTION_HINTS[suggesting.kind];
  }

  if (isWorking) {
    return hasDraft
      ? [
          ["enter", "queue"],
          ["esc", "interrupt"],
        ]
      : [["esc", "interrupt"]];
  }

  return hasDraft
    ? [
        ["enter", "send"],
        ["shift+enter", "newline"],
      ]
    : [
        ["/", "commands"],
        ["ctrl+p", "palette"],
        ["ctrl+s", "sessions"],
      ];
};

const INPUT_ROWS = 2;

export function Composer(props: {
  readonly color: RoleColor;
  readonly model: string;
  readonly thinking: string;
  readonly draft: string;
  readonly isWorking: boolean;
  /** Whether the top edge glides. Off while working when the header carries the motion. */
  readonly isGliding: boolean;
}) {
  const surface = () => props.color("surface.raised");
  const suggesting = () => suggestingFor(props.draft);

  return (
    <box flexDirection="column" flexShrink={0}>
      <Switch>
        <Match when={suggesting().kind === "commands"}>
          <CommandSuggestions color={props.color} surface={surface()} typed={suggesting().typed} />
        </Match>
        <Match when={suggesting().kind === "files"}>
          <FileSuggestions color={props.color} surface={surface()} typed={suggesting().typed} />
        </Match>
      </Switch>
      <box flexDirection="column" backgroundColor={surface()}>
        <ScanLine color={props.color} surface={surface()} isWorking={props.isGliding} />
        <box flexDirection="column" paddingX={2} paddingBottom={1}>
          <textarea
            height={INPUT_ROWS}
            initialValue={props.draft}
            placeholder="Ask anything, or / for commands"
            backgroundColor={surface()}
            focusedBackgroundColor={surface()}
            textColor={props.color("text.base")}
            focusedTextColor={props.color("text.base")}
            placeholderColor={props.color("text.faint")}
            cursorColor={props.color("text.accent")}
          />
          <text wrapMode="none">
            <span style={{ fg: props.color("text.accent") }}>{props.model}</span>
            <span style={{ fg: props.color("text.muted") }}>{` (${props.thinking})`}</span>
          </text>
        </box>
      </box>
      <box paddingX={2}>
        <Hints
          color={props.color}
          hints={hintsFor(suggesting(), props.isWorking, props.draft.length > 0)}
        />
      </box>
    </box>
  );
}
