/**
 * Notices: what happened in a session, saved in the transcript for the user; the model never sees
 * it.
 */

import { definePlugin } from "@liminal/sdk";
import { EntryKinds } from "@liminal/session-log/contract";

export default definePlugin({
  name: "notices",
  provides: [],
  requires: [EntryKinds],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
