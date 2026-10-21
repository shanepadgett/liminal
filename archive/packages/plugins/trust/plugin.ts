/**
 * Trust: in an untrusted workspace, a prompt in the composer's place asks the user to trust the
 * folder, so its project settings and plugins load.
 */

import { definePlugin } from "@liminal/sdk";

import { TrustRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "trust",
  provides: [],
  requires: [],
  uses: [],
  enabledByDefault: true,
  rpcs: TrustRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
