/**
 * Approval: decides the tool calls a check asks about, through a decision model, a reviewer model
 * and then the user, and owns the checks that ask.
 */

import { CommandRunner } from "@liminal/command-runner/contract";
import { Decisions } from "@liminal/decisions/contract";
import { WorkspaceFiles } from "@liminal/files/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ShellSafety } from "@liminal/shell-safety/contract";
import { Approvers, ToolChecks } from "@liminal/tools/contract";

import { Approval, ApprovalRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "approval",
  provides: [Approval],
  requires: [
    ToolChecks,
    Approvers,
    ShellSafety,
    Settings,
    SessionLog,
    EntryKinds,
    Models,
    ModelTask,
    WorkspaceFiles,
    CommandRunner,
  ],
  uses: [Decisions],
  enabledByDefault: true,
  rpcs: ApprovalRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
