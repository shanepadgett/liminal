/**
 * File-changing tools: `edit` replaces text that appears once in a file; `write` writes a whole
 * file.
 */

import { WorkspaceFiles } from "@liminal/files/contract";
import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tools/contract";

export default definePlugin({
  name: "tools-edit",
  provides: [],
  requires: [Tools, WorkspaceFiles],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
