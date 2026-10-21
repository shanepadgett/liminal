/**
 * Processes: commands the agent starts and leaves running, such as dev servers and watchers. A
 * small holder program keeps them, so they outlive a restart of the server.
 */

import { BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

import { ProcessesRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "processes",
  provides: [],
  requires: [Tools, BeforeCallHooks, TurnEndingHooks, EntryKinds],
  uses: [],
  enabledByDefault: true,
  rpcs: ProcessesRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
