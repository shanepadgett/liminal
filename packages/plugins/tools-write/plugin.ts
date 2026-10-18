/** Write tool: `write`: a whole file, with its folders, in the workspace. */

import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

export default definePlugin({
  name: "tools-write",
  provides: [],
  requires: [Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
