/**
 * The stashes, opened by `/pop`: a dialog titled Stashes with a filter line and the drafts parked
 * with ctrl+s in this folder, newest first. Each row is the draft's first line, then when it was
 * stashed. Enter brings the draft back after what the input holds; ctrl+d discards it after a
 * confirm.
 */

import { For } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { FilterLine, NamedRow } from "./PickerRows.tsx";

type Stash = { readonly id: number; readonly line: string; readonly stashed: string };

const STASHES: readonly Stash[] = [
  { id: 3, line: "also check how reload handles a plugin that", stashed: "Oct 18, 2026, 7:51 PM" },
  {
    id: 2,
    line: "rename the gallery's composer states to match",
    stashed: "Oct 18, 2026, 5:02 PM",
  },
  {
    id: 1,
    line: "why does the sidebar drawer cover the hints?",
    stashed: "Oct 16, 2026, 11:20 AM",
  },
];

const HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "select"],
  ["ctrl+d", "discard"],
];

export function StashPicker(props: { readonly color: RoleColor; readonly selected: number }) {
  return (
    <Dialog color={props.color} title="Stashes" hints={HINTS}>
      <FilterLine color={props.color} />
      <box flexDirection="column">
        <For each={STASHES}>
          {(stash) => (
            <NamedRow
              color={props.color}
              name={stash.line}
              detail={stash.stashed}
              isSelected={stash.id === props.selected}
            />
          )}
        </For>
      </box>
    </Dialog>
  );
}
