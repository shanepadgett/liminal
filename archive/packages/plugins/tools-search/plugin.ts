/**
 * Tool search: `tool_search` loads deferred tools, ranked by how often this project uses them, and
 * a prompt section lists them so the model knows what it can load.
 */

import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

export default definePlugin({
  name: "tools-search",
  provides: [],
  requires: [PromptSections, SessionLog, Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
