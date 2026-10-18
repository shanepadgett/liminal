/** Read tool: `read`: a text file in windows of lines, in the workspace. */

import { WorkspaceFiles } from "@liminal/files/contract";
import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tools/contract";

export default definePlugin({
  name: "tools-read",
  provides: [],
  requires: [Tools, WorkspaceFiles],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
