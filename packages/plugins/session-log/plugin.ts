/** Session-log: append, read and follow session entries over a SessionStore. */

import { definePlugin, SessionFeed } from "@liminal/sdk";
import { SessionStore } from "@liminal/session-store/contract";

import { EntryKinds, SessionLog, SessionLogRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "session-log",
  provides: [SessionLog, SessionFeed, EntryKinds],
  requires: [SessionStore],
  uses: [],
  enabledByDefault: true,
  rpcs: SessionLogRpcs,
  server: () => import("./src/server.ts"),
});
