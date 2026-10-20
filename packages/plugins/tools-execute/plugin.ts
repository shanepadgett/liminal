/**
 * Execute tool: `execute` runs a script whose functions are the other tools, so one call can chain
 * calls and filter their results before the model reads them.
 */

import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { ToolPipeline, Tools } from "@liminal/tools/contract";

export default definePlugin({
  name: "tools-execute",
  provides: [],
  requires: [Tools, ToolPipeline, SessionLog],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
