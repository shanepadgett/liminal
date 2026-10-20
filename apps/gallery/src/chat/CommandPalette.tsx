/**
 * The command palette, opened with ctrl+p: a dialog titled Commands with a filter line and the
 * commands grouped into sections. The row under the cursor is highlighted; each command's key sits
 * at the right. When the window is too short for the whole list, the list scrolls.
 */

import { For, Show } from "solid-js";

import { type Hint, type RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { ListRow } from "./ListRow.tsx";
import { Section } from "./Section.tsx";

type Command = { readonly id: string; readonly label: string; readonly key?: string };

type CommandSection = { readonly title: string; readonly commands: readonly Command[] };

const COMMAND_SECTIONS: readonly CommandSection[] = [
  {
    title: "Session",
    commands: [
      { id: "session.new", label: "New session", key: "ctrl+n" },
      { id: "session.switch", label: "Switch session" },
      { id: "inbox.pop", label: "Stashes" },
      { id: "session.rename", label: "Rename session" },
      { id: "session.compact", label: "Compact context" },
    ],
  },
  {
    title: "Model",
    commands: [
      { id: "model.switch", label: "Switch model", key: "ctrl+l" },
      { id: "model.thinking", label: "Thinking level", key: "ctrl+t" },
    ],
  },
  {
    title: "View",
    commands: [
      { id: "view.sidebar", label: "Toggle sidebar", key: "ctrl+b" },
      { id: "view.theme", label: "Change theme" },
    ],
  },
  {
    title: "Liminal",
    commands: [
      { id: "skills.manage", label: "Manage skills" },
      { id: "help.keys", label: "Keyboard shortcuts", key: "?" },
      { id: "app.quit", label: "Quit", key: "ctrl+c" },
    ],
  },
];

/** Every section's title and commands, with a blank row between sections. */
const LIST_ROWS = COMMAND_SECTIONS.reduce(
  (rows, section, index) => rows + (index === 0 ? 0 : 1) + 1 + section.commands.length,
  0,
);

const HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "run"],
];

function CommandRow(props: {
  readonly color: RoleColor;
  readonly command: Command;
  readonly isSelected: boolean;
}) {
  return (
    <ListRow color={props.color} isSelected={props.isSelected}>
      <text
        flexGrow={1}
        wrapMode="none"
        fg={props.color(props.isSelected ? "text.base" : "text.muted")}
      >
        {props.command.label}
      </text>
      <Show when={props.command.key}>
        {(key) => (
          <text flexShrink={0} fg={props.color(props.isSelected ? "text.muted" : "text.faint")}>
            {key()}
          </text>
        )}
      </Show>
    </ListRow>
  );
}

export function CommandPalette(props: { readonly color: RoleColor; readonly selected: string }) {
  return (
    <Dialog color={props.color} title="Commands" hints={HINTS}>
      <text flexShrink={0}>
        <span style={{ fg: props.color("text.accent") }}>{"› "}</span>
        <span style={{ fg: props.color("text.ghost") }}>Type to filter</span>
      </text>
      <scrollbox
        height={LIST_ROWS}
        flexShrink={1}
        minHeight={0}
        scrollbarOptions={{ visible: false }}
      >
        <box flexDirection="column" gap={1}>
          <For each={COMMAND_SECTIONS}>
            {(section) => (
              <box flexDirection="column">
                <Section color={props.color} title={section.title} />
                <For each={section.commands}>
                  {(command) => (
                    <CommandRow
                      color={props.color}
                      command={command}
                      isSelected={command.id === props.selected}
                    />
                  )}
                </For>
              </box>
            )}
          </For>
        </box>
      </scrollbox>
    </Dialog>
  );
}
