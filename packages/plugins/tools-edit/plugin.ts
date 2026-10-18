/** Edit tool: `edit`: replaces text that appears once in a file, in the workspace. */

import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

export default definePlugin({
  name: "tools-edit",
  provides: [],
  requires: [Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
