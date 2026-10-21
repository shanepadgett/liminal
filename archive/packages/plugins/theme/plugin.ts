/** Theme: the palette the TUI draws in, kept in the `theme` settings and picked with `/theme`. */

import { definePlugin } from "@liminal/sdk";
import { Settings } from "@liminal/settings/contract";

import { ThemeRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "theme",
  provides: [],
  requires: [Settings],
  uses: [],
  enabledByDefault: true,
  rpcs: ThemeRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
