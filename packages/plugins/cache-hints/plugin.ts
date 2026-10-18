/** Cache-hints: marks where each request's cached prefix ends, for providers that cache by mark. */

import { RequestSteps } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";

import { cacheHintsPlugin } from "./src/contract.ts";

export default definePlugin({
  name: cacheHintsPlugin,
  provides: [],
  requires: [RequestSteps],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
