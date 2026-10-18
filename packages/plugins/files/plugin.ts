/** Files: reads and writes files in the workspace for the tools that work on them. */

import { definePlugin } from "@liminal/sdk";

import { WorkspaceFiles } from "./src/contract.ts";

export default definePlugin({
  name: "files",
  provides: [WorkspaceFiles],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
