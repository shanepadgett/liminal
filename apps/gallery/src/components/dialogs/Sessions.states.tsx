import type { State } from "../../entries.ts";
import { Picker, PICKER_HINTS, type PickerRow } from "./Picker.tsx";

const SESSIONS: readonly PickerRow[] = [
  { id: "s1", title: "Sorting out the plugin host", detail: "2h ago", section: "Today" },
  { id: "s2", title: "Why the loop retries twice", detail: "4h ago", section: "Today" },
  { id: "s3", title: "Logout for ChatGPT", detail: "18:20", section: "Yesterday" },
  { id: "s4", title: "Model catalog cache", detail: "Oct 14", section: "Earlier" },
  { id: "s5", title: "Print mode exit codes", detail: "Oct 9", section: "Earlier" },
];

const sessions = (query: string, selected: string) => () => (
  <Picker
    title="Sessions"
    placeholder="Search sessions"
    empty="No saved sessions"
    rows={SESSIONS}
    query={query}
    selected={selected}
    hints={PICKER_HINTS}
  />
);

export const sessionsStates: readonly [State, ...State[]] = [
  { name: "Open", fill: "center", view: sessions("", "s1") },
  { name: "Filtered", fill: "center", view: sessions("loop", "s2") },
  {
    name: "None saved",
    fill: "center",
    view: () => (
      <Picker
        title="Sessions"
        placeholder="Search sessions"
        empty="No saved sessions"
        rows={[]}
        query=""
        selected=""
        hints={PICKER_HINTS}
      />
    ),
  },
];
