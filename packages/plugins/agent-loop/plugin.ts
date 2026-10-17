/** Agent-loop: runs a turn, step by step, until a final answer or a plugin ends it. */

import { Context } from "@liminal/context/contract";
import { Models } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { ToolPipeline } from "@liminal/tool-pipeline/contract";
import { Tools } from "@liminal/tool-registry/contract";

import { AfterFailureHooks, AgentLoop, BeforeCallHooks, TurnEndingHooks } from "./src/contract.ts";

export default definePlugin({
  name: "agent-loop",
  provides: [AgentLoop, BeforeCallHooks, AfterFailureHooks, TurnEndingHooks],
  requires: [SessionLog, Context, Models, Tools, ToolPipeline],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
