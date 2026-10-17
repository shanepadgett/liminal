/** Tool-pipeline: runs each tool call through the checks and wrappers plugins add. */

import { definePlugin } from "@liminal/sdk";

import { Approvals, ToolChecks, ToolPipeline, ToolWrappers } from "./src/contract.ts";

export default definePlugin({
  name: "tool-pipeline",
  provides: [ToolPipeline, ToolChecks, ToolWrappers],
  requires: [],
  uses: [Approvals],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
