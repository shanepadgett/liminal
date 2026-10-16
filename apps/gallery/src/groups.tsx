/** Everything the gallery shows, in review order: tokens first, scenarios last. */

import type { Groups } from "./shell/entries.ts";
import { PALETTES } from "./tokens/palettes.ts";
import { PaletteView } from "./tokens/PaletteView.tsx";
import { TerminalView } from "./tokens/TerminalView.tsx";

export const GROUPS: Groups = [
  {
    title: "Tokens",
    sections: [
      {
        title: "Palettes",
        entries: [
          ...PALETTES.map((palette) => ({
            id: palette.id,
            title: palette.name,
            view: () => <PaletteView palette={palette} />,
          })),
          { id: "terminal", title: "Terminal", view: () => <TerminalView /> },
        ],
      },
    ],
  },
  { title: "Primitives", sections: [] },
  { title: "Components", sections: [] },
  { title: "Screens", sections: [] },
  { title: "Scenarios", sections: [] },
];
