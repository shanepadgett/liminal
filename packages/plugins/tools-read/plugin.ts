/** Read tool: `read`: a text file in windows of lines, in the workspace. */

import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

export default definePlugin({
  name: "tools-read",
  provides: [],
  requires: [Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
