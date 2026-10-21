/** Session-store: durable session entries in one SQLite database in the data folder. */

import { definePlugin } from "@liminal/sdk";

import { SessionStore } from "./src/contract.ts";

export default definePlugin({
  name: "session-store",
  provides: [SessionStore],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
