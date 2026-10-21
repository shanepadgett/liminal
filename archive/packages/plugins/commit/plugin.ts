/**
 * Commit: `/commit` runs the project's checks, has the small model group every changed file into
 * conventional commits, commits them once the user agrees, and pushes as the `commit` settings
 * say.
 */

import { AgentLoop } from "@liminal/agent-loop/contract";
import { CommitChecks } from "@liminal/checks/contract";
import { CommandRunner } from "@liminal/command-runner/contract";
import { Inbox } from "@liminal/inbox/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";

import { CommitRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "commit",
  provides: [],
  requires: [
    AgentLoop,
    CommitChecks,
    CommandRunner,
    Inbox,
    Models,
    ModelTask,
    SessionLog,
    Settings,
  ],
  uses: [],
  enabledByDefault: true,
  rpcs: CommitRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
