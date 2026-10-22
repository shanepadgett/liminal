import type { State } from "../entries.ts";
import { useTheme } from "../theme/theme.tsx";
import { PaletteView } from "./PaletteView.tsx";

/** The palette `t` has chosen. */
function Current() {
  const theme = useTheme();

  return <PaletteView palette={theme().palette} />;
}

export const paletteStates: readonly [State, ...State[]] = [
  { name: "Current", fill: "page", view: () => <Current /> },
];
