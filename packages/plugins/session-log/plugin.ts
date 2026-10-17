/** Session-log: append, read and follow session entries over a SessionStore. */

import { definePlugin } from "@liminal/sdk";
import { SessionStore } from "@liminal/session-store/contract";

import { EntryKinds, SessionLog } from "./src/contract.ts";

export default definePlugin({
  name: "session-log",
  provides: [SessionLog, EntryKinds],
  requires: [SessionStore],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
