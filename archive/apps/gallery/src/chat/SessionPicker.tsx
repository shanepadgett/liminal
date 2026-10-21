/**
 * The session picker, opened by `/sessions`: a dialog titled Sessions with a filter line and the
 * sessions started in this folder, newest first. Each row is the session's first message, then when
 * it was last written. A session with no message yet is "Untitled session". The current session is
 * highlighted when it opens.
 */

import { For } from "solid-js";

import type { Hint, RoleColor } from "@liminal/sdk/tui";

import { Dialog } from "./Dialog.tsx";
import { FilterLine, NamedRow } from "./PickerRows.tsx";

type Session = { readonly id: string; readonly title: string; readonly written: string };

const SESSIONS: readonly Session[] = [
  { id: "s4", title: "Explain how the plugin host boots", written: "Oct 18, 2026, 7:42 PM" },
  { id: "s3", title: "Untitled session", written: "Oct 18, 2026, 6:10 PM" },
  {
    id: "s2",
    title: "fix the test so it checks they start concurrently",
    written: "Oct 17, 2026, 4:05 PM",
  },
  { id: "s1", title: "the reload check fails on a fresh clone:", written: "Oct 12, 2026, 9:18 AM" },
];

const HINTS: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "switch"],
];

export function SessionPicker(props: { readonly color: RoleColor; readonly selected: string }) {
  return (
    <Dialog color={props.color} title="Sessions" hints={HINTS}>
      <FilterLine color={props.color} />
      <box flexDirection="column">
        <For each={SESSIONS}>
          {(session) => (
            <NamedRow
              color={props.color}
              name={session.title}
              detail={session.written}
              isSelected={session.id === props.selected}
            />
          )}
        </For>
      </box>
    </Dialog>
  );
}
