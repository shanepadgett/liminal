/**
 * The references, opened by `/references`: a dialog titled References with every clone, the
 * session's attached ones marked with a filled dot. Each row is the clone's name, its description,
 * then its branch, or a clone's progress or git's error in place of the branch. Space marks, enter
 * attaches the marked ones, and the other keys clone, pull, switch branch, open and delete.
 */

import { For } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";

/** A clone as the dialog shows it; `note` replaces the branch while something runs or failed. */
type Clone = {
  readonly name: string;
  readonly description: string;
  readonly branch: string;
  readonly note?: string;
};

const CLONES: readonly Clone[] = [
  { name: "bubbletea", description: "A powerful little TUI framework", branch: "main" },
  { name: "effect", description: "Build production-ready applications", branch: "main" },
  { name: "lipgloss", description: "Style definitions for nice terminal layouts", branch: "main" },
  {
    name: "opencode",
    description: "The open source AI coding agent",
    branch: "dev",
    note: "↓ 37%",
  },
  {
    name: "pi",
    description: "AI agent toolkit",
    branch: "main",
    note: "! could not read from remote repository",
  },
];

/** The empty state: no clones yet. */
export const NO_CLONES: readonly Clone[] = [];

const HINTS: readonly Hint[] = [
  ["space", "mark"],
  ["enter", "attach"],
  ["^n", "clone"],
  ["^u", "pull"],
  ["^r", "branch"],
  ["^o", "open"],
  ["^x", "delete"],
];

function CloneRow(props: {
  readonly color: RoleColor;
  readonly clone: Clone;
  readonly isMarked: boolean;
  readonly isSelected: boolean;
}) {
  const faint = () => props.color(props.isSelected ? "text.muted" : "text.faint");
  const note = () => props.clone.note ?? props.clone.branch;

  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <box flexDirection="row" gap={1} flexGrow={1}>
        <text flexShrink={0} fg={props.color(props.isMarked ? "text.accent" : "text.faint")}>
          {props.isMarked ? "●" : "○"}
        </text>
        <text
          flexShrink={0}
          wrapMode="none"
          fg={props.color(props.isSelected ? "text.base" : "text.muted")}
        >
          {props.clone.name}
        </text>
        <text flexGrow={1} flexShrink={1} wrapMode="none" fg={faint()}>
          {props.clone.description}
        </text>
        <text
          flexShrink={0}
          wrapMode="none"
          fg={note().startsWith("!") ? props.color("feedback.warning") : faint()}
        >
          {note()}
        </text>
      </box>
    </ListRow>
  );
}

export function ReferencesPicker(props: {
  readonly color: RoleColor;
  readonly marked: readonly string[];
  readonly selected: string;
  readonly clones?: readonly Clone[];
}) {
  const clones = () => props.clones ?? CLONES;

  return (
    <Dialog color={props.color} title="References" hints={HINTS}>
      {clones().length === 0 ? (
        <text fg={props.color("text.muted")}>No references. Ctrl+n clones one from a git URL.</text>
      ) : (
        <box flexDirection="column">
          <For each={clones()}>
            {(clone) => (
              <CloneRow
                color={props.color}
                clone={clone}
                isMarked={props.marked.includes(clone.name)}
                isSelected={clone.name === props.selected}
              />
            )}
          </For>
        </box>
      )}
    </Dialog>
  );
}
