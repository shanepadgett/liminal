/** Cancel: stops a session's running turn, from the TUI's Esc key. */

import { AgentLoop } from "@liminal/agent-loop/contract";
import { definePlugin } from "@liminal/sdk";

import { CancelRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "cancel",
  provides: [],
  requires: [AgentLoop],
  uses: [],
  enabledByDefault: true,
  rpcs: CancelRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
