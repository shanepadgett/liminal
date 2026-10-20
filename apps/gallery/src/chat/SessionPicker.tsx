/** Session dialog samples: wider titles, trailing activity dates, and Active/Archived views. */

import { For, Show } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { FilterLine, NamedRow } from "./PickerRows.tsx";

type Session = { readonly id: string; readonly title: string; readonly written: string };

const ACTIVE: readonly Session[] = [
  { id: "s4", title: "Explain how the plugin host boots", written: "2 hours ago" },
  { id: "s3", title: "Untitled session", written: "5 hours ago" },
  {
    id: "s2",
    title: "Fix the test so it checks that the model calls start concurrently",
    written: "3 days ago",
  },
  {
    id: "s1",
    title: "Keep the session title readable when the dialog also shows its last conversation date",
    written: "6 days ago",
  },
];

const ARCHIVED: readonly Session[] = [
  { id: "a3", title: "Review the archive and restore shortcuts", written: "2 hours ago" },
  { id: "a2", title: "Fix the reload check on a fresh clone", written: "Oct 17" },
  {
    id: "a1",
    title:
      "Investigate why the provider reconnects after every tool call instead of reusing its session",
    written: "Oct 8",
  },
  { id: "a0", title: "Sketch the first plugin contracts", written: "Dec 12, 2025" },
];

export function SessionPicker(props: {
  readonly color: RoleColor;
  readonly view: "active" | "archived";
  readonly selected: string;
  readonly sessions?: readonly Session[];
}) {
  const isArchived = () => props.view === "archived";
  const sessions = () => props.sessions ?? (isArchived() ? ARCHIVED : ACTIVE);

  const hints = (): readonly Hint[] => [
    ["↑↓", "choose"],
    ["enter", "switch"],
    ["tab", isArchived() ? "active" : "archived"],
    ["ctrl+a", isArchived() ? "restore" : "archive"],
  ];

  return (
    <Dialog
      color={props.color}
      title={`Sessions · ${isArchived() ? "Archived" : "Active"}`}
      width={90}
      hints={hints()}
    >
      <FilterLine color={props.color} />
      <box flexDirection="column">
        <Show
          when={sessions().length > 0}
          fallback={
            <text fg={props.color("text.faint")}>
              {isArchived() ? "No archived sessions" : "No active sessions"}
            </text>
          }
        >
          <For each={sessions()}>
            {(session) => (
              <NamedRow
                color={props.color}
                name={session.title}
                detail={session.written}
                detailPosition="right"
                isSelected={session.id === props.selected}
              />
            )}
          </For>
        </Show>
      </box>
    </Dialog>
  );
}
