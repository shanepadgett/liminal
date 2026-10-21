/**
 * Agent-loop: runs a turn, step by step, until a final answer or a plugin ends it; `/model` sets
 * the default model.
 */

import { Context } from "@liminal/context/contract";
import { Models } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ToolPipeline } from "@liminal/tools/contract";
import { Tools } from "@liminal/tools/contract";

import {
  AfterFailureHooks,
  AgentLoop,
  AgentLoopRpcs,
  BeforeCallHooks,
  TurnEndingHooks,
} from "./src/contract.ts";

export default definePlugin({
  name: "agent-loop",
  provides: [AgentLoop, BeforeCallHooks, AfterFailureHooks, TurnEndingHooks],
  requires: [SessionLog, EntryKinds, Context, Models, Tools, ToolPipeline, Settings],
  uses: [],
  enabledByDefault: true,
  rpcs: AgentLoopRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
