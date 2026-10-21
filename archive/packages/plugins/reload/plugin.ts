/** Reload: shows a pending plugin reload or restart in the chat header, and applies it on ctrl+r. */

import { definePlugin } from "@liminal/sdk";

import { reloadPlugin } from "./src/contract.ts";

export default definePlugin({
  name: reloadPlugin,
  provides: [],
  requires: [],
  uses: [],
  enabledByDefault: true,
  tui: () => import("./src/tui.tsx"),
});
