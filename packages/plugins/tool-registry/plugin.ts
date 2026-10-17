/** Tool-registry: the tools the model can call. */

import { definePlugin } from "@liminal/sdk";

import { Tools } from "./src/contract.ts";

export default definePlugin({
  name: "tool-registry",
  provides: [Tools],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
