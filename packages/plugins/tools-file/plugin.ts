/** File tools: `read`, `write` and `edit` in the workspace. */

import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

export default definePlugin({
  name: "tools-file",
  provides: [],
  requires: [Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
