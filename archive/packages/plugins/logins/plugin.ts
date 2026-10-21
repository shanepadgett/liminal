/** Logins: the ways to sign in to each provider, and `/connect` to sign in and out. */

import { CredentialStore } from "@liminal/credential-store/contract";
import { definePlugin } from "@liminal/sdk";

import { LoginMethods, LoginsRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "logins",
  provides: [LoginMethods],
  requires: [CredentialStore],
  uses: [],
  enabledByDefault: true,
  rpcs: LoginsRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
