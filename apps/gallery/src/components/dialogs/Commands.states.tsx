import type { State } from "../../entries.ts";
import { Picker, PICKER_HINTS, type PickerRow } from "./Picker.tsx";

export const COMMANDS: readonly PickerRow[] = [
  { id: "new", title: "New session", detail: "ctrl+n", section: "Session" },
  { id: "sessions", title: "Open a session", detail: "ctrl+o", section: "Session" },
  { id: "model", title: "Switch model", detail: "ctrl+m", section: "Model" },
  { id: "connect", title: "Connect a provider", detail: "/connect", section: "Model" },
  { id: "palette", title: "Change palette", section: "Liminal" },
  { id: "quit", title: "Quit", detail: "ctrl+q", section: "Liminal" },
];

const commands = (query: string, selected: string) => () => (
  <Picker
    title="Commands"
    placeholder="Search commands"
    empty="No commands"
    rows={COMMANDS}
    query={query}
    selected={selected}
    hints={PICKER_HINTS}
  />
);

export const commandsStates: readonly [State, ...State[]] = [
  { name: "Open", fill: "center", view: commands("", "new") },
  { name: "Filtered", fill: "center", view: commands("mod", "model") },
  { name: "No matches", fill: "center", view: commands("xyzzy", "") },
];
