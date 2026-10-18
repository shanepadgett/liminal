/** Chat: the TUI's chat screen, and the slots other plugins draw the session into. */

import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

export default definePlugin({
  name: "chat",
  provides: [],
  requires: [SessionLog],
  uses: [],
  enabledByDefault: true,
  tui: () => import("./src/tui.tsx"),
});
