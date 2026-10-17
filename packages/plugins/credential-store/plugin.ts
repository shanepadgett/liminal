/** Credential-store: secrets for login methods, in SQLite, with OAuth refresh under a lock. */

import { definePlugin } from "@liminal/sdk";

import { CredentialStore } from "./src/contract.ts";

export default definePlugin({
  name: "credential-store",
  provides: [CredentialStore],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
