/**
 * Attention: a sound when the session on screen needs the user, as when its turn ends or a tool
 * call waits for approval.
 */

import { Approval } from "@liminal/approval/contract";
import { definePlugin } from "@liminal/sdk";

import { attentionPlugin } from "./src/contract.ts";

export default definePlugin({
  name: attentionPlugin,
  provides: [],
  requires: [Approval],
  uses: [],
  enabledByDefault: true,
  tui: () => import("./src/tui.tsx"),
});
