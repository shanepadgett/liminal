/** Inbox: the user's input to a session, sent now or queued while a turn runs. */

import { AgentLoop, BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { Inbox, InboxRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "inbox",
  provides: [Inbox],
  requires: [SessionLog, AgentLoop, BeforeCallHooks, TurnEndingHooks],
  uses: [],
  enabledByDefault: true,
  rpcs: InboxRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
