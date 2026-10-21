/**
 * Usage: what a session's model calls used and cost, from each reply's token counts and the
 * catalog's prices, drawn as the sidebar's Context and Cost sections.
 */

import { AgentLoop } from "@liminal/agent-loop/contract";
import { Models } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { UsageRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "usage",
  provides: [],
  requires: [SessionLog, Models],
  uses: [AgentLoop],
  enabledByDefault: true,
  rpcs: UsageRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
