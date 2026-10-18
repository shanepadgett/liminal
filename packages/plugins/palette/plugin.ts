/** Palette: the command palette, which ctrl+p opens over the TUI. */

import { definePlugin } from "@liminal/sdk";

import { palettePlugin } from "./src/contract.ts";

export default definePlugin({
  name: palettePlugin,
  provides: [],
  requires: [],
  uses: [],
  enabledByDefault: true,
  tui: () => import("./src/tui.tsx"),
});
