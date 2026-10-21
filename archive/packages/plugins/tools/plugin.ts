/** Tools: the tools the model can call, how each call runs, and how the model should use them. */

import { PromptSections, ToolSources } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";

import { Approvers, ToolChecks, ToolPipeline, Tools, ToolWrappers } from "./src/contract.ts";

export default definePlugin({
  name: "tools",
  provides: [Tools, ToolPipeline, ToolChecks, ToolWrappers, Approvers],
  requires: [PromptSections, ToolSources],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
