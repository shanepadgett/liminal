/**
 * Checks: the project's commands from `.liminal/checks.json`. Fixers run on each call's changed
 * files; checks run through the `checks` tool and when a turn would end with unchecked changes.
 */

import { BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { CommandRunner } from "@liminal/command-runner/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { LongOutput } from "@liminal/tool-output/contract";
import { Tools, ToolWrappers } from "@liminal/tools/contract";

export default definePlugin({
  name: "checks",
  provides: [],
  requires: [
    BeforeCallHooks,
    TurnEndingHooks,
    CommandRunner,
    EntryKinds,
    SessionLog,
    LongOutput,
    Tools,
    ToolWrappers,
  ],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
