import type { State } from "../entries.ts";
import { Hints, HintsExpandedProvider } from "./Hints.tsx";

const COMPOSER_HINTS = [
  { keys: "enter", label: "send" },
  { keys: "shift+enter", label: "new line" },
  { keys: "ctrl+s", label: "stash" },
  { keys: "shift+tab", label: "thinking" },
  { keys: "ctrl+c", label: "clear" },
  { keys: "tab", label: "focus" },
  { keys: "ctrl+q", label: "quit" },
];

/** The hints in a line `columns` wide, against its right edge as the composer draws them. */
const line = (columns: number, isExpanded: boolean) => () => (
  <box width={columns}>
    <HintsExpandedProvider value={() => isExpanded}>
      <Hints hints={COMPOSER_HINTS} end />
    </HintsExpandedProvider>
  </box>
);

export const hintsStates: readonly [State, ...State[]] = [
  {
    name: "Dialog footer",
    fill: "page",
    view: () => (
      <Hints
        hints={[
          { keys: "ctrl+f", label: "favorite" },
          { keys: "ctrl+d", label: "delete" },
        ]}
      />
    ),
  },
  { name: "Fits", fill: "center", view: line(110, false) },
  { name: "Cut short", fill: "center", view: line(60, false) },
  { name: "Expanded", fill: "center", view: line(60, true) },
];
