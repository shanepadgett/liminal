/**
 * Inbox: the user's input to a session, sent now or queued while a turn runs, with its `@` tags,
 * pictures and stashes.
 */

import { AgentLoop, BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { Inbox, InboxRpcs, TagSources } from "./src/contract.ts";

export default definePlugin({
  name: "inbox",
  provides: [Inbox, TagSources],
  requires: [SessionLog, AgentLoop, BeforeCallHooks, TurnEndingHooks],
  uses: [],
  enabledByDefault: true,
  rpcs: InboxRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
