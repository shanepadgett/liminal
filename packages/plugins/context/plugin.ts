/** Context: builds what the model sees from a session's entries. */

import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tool-registry/contract";

import { Context, ContextRpcs, PromptSections, RequestSteps, ViewSteps } from "./src/contract.ts";

export default definePlugin({
  name: "context",
  provides: [Context, PromptSections, ViewSteps, RequestSteps],
  requires: [SessionLog, EntryKinds],
  uses: [Tools],
  enabledByDefault: true,
  rpcs: ContextRpcs,
  server: () => import("./src/server.ts"),
});
