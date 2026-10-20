/**
 * Attention: a sound when the session on screen needs the user, as when its turn ends or a workflow
 * waits for input. The palette turns it on and off and picks the sound.
 */

import { definePlugin } from "@liminal/sdk";
import { Settings } from "@liminal/settings/contract";

import { attentionPlugin, AttentionRpcs } from "./src/contract.ts";

export default definePlugin({
  name: attentionPlugin,
  provides: [],
  requires: [Settings],
  uses: [],
  enabledByDefault: true,
  rpcs: AttentionRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
