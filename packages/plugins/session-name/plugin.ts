/** Session name: the `name_session` tool names a session once; a checkpoint renames it later. */

import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { ToolChecks, Tools } from "@liminal/tools/contract";

export default definePlugin({
  name: "session-name",
  provides: [],
  requires: [SessionLog, Tools, ToolChecks],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
