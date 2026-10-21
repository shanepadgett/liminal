/**
 * Agents files: the user's `AGENTS.md` files and those from the repository root down to the
 * workspace, kept current in the prompt.
 */

import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

export default definePlugin({
  name: "agents-files",
  provides: [],
  requires: [PromptSections, SessionLog],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
