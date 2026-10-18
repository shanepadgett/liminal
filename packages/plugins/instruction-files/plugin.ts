/**
 * Instruction files: Markdown files in `~/.liminal/instructions/` and, in a trusted workspace,
 * `.liminal/instructions/` from the repository root down to the workspace. `always: true` files are
 * in every prompt; `read-when: <situation>` files are listed for the model to read when their
 * situation comes up.
 */

import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

export default definePlugin({
  name: "instruction-files",
  provides: [],
  requires: [PromptSections, SessionLog],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
