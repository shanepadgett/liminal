/** Chat: the TUI's chat screen, and the slots other plugins draw the session into. */

import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";

import { ChatRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "chat",
  provides: [],
  requires: [SessionLog, Settings],
  uses: [],
  enabledByDefault: true,
  rpcs: ChatRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
