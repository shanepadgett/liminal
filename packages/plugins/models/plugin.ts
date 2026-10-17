/** Models: streams one model call through a registered provider. */

import { definePlugin } from "@liminal/sdk";

import { ModelProviders, Models } from "./src/contract.ts";

export default definePlugin({
  name: "models",
  provides: [Models, ModelProviders],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
