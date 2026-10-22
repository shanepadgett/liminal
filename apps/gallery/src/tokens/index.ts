import type { Group } from "../entries.ts";
import { paletteStates } from "./PaletteView.states.tsx";
import { terminalStates } from "./TerminalView.states.tsx";

export const tokens: Group = {
  title: "Tokens",
  sections: [
    {
      title: "Palettes",
      entries: [
        { id: "palette", title: "Palette", states: paletteStates },
        { id: "terminal", title: "Terminal", states: terminalStates },
      ],
    },
  ],
};
