/**
 * Vocabulary: the project's agreed terms in `.liminal/vocabulary.json`. Their names are in every
 * prompt and the `vocabulary` tool reads and changes them.
 */

import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

export default definePlugin({
  name: "vocabulary",
  provides: [],
  requires: [PromptSections, SessionLog, Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
