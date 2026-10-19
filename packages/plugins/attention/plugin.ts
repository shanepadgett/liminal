/**
 * Attention: a sound when the session on screen needs the user, as when its turn ends or a workflow
 * waits for input.
 */

import { definePlugin } from "@liminal/sdk";

import { attentionPlugin } from "./src/contract.ts";

export default definePlugin({
  name: attentionPlugin,
  provides: [],
  requires: [],
  uses: [],
  enabledByDefault: true,
  tui: () => import("./src/tui.tsx"),
});
