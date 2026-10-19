/**
 * Memory: keeps a session within the model's context window. The model writes checkpoints, a cheap
 * model writes notes and memories in the background, and the view step folds the history at the
 * latest checkpoint.
 */

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { CommandRunner } from "@liminal/command-runner/contract";
import { ViewSteps } from "@liminal/context/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ToolChecks, Tools, ToolWrappers } from "@liminal/tools/contract";

import { MemoryRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "memory",
  provides: [],
  requires: [
    ViewSteps,
    SessionLog,
    EntryKinds,
    Tools,
    ToolChecks,
    ToolWrappers,
    CommandRunner,
    BeforeCallHooks,
    Models,
    ModelTask,
    Settings,
  ],
  uses: [],
  enabledByDefault: true,
  rpcs: MemoryRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
