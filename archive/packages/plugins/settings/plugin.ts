/** Settings: layered `settings.json` files; each plugin reads its own section. */

import { definePlugin } from "@liminal/sdk";

import { Settings } from "./src/contract.ts";

export default definePlugin({
  name: "settings",
  provides: [Settings],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
