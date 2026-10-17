/** Context: builds what the model sees from a session's entries. */

import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tool-registry/contract";

import { Context, PromptSections, ViewSteps } from "./src/contract.ts";

export default definePlugin({
  name: "context",
  provides: [Context, PromptSections, ViewSteps],
  requires: [SessionLog, EntryKinds],
  uses: [Tools],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
