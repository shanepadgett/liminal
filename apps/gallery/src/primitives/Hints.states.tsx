import type { State } from "../entries.ts";
import { Hints } from "./Hints.tsx";

export const hintsStates: readonly [State, ...State[]] = [
  {
    name: "Picker",
    fill: "page",
    view: () => (
      <Hints
        hints={[
          { keys: "↑↓", label: "choose" },
          { keys: "enter", label: "select" },
          { keys: "esc", label: "close" },
        ]}
      />
    ),
  },
];
