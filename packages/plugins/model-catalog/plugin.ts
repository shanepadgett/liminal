/** Model-catalog: model names, limits, thinking options and prices from models.dev. */

import { definePlugin } from "@liminal/sdk";

import { ModelCatalog } from "./src/contract.ts";

export default definePlugin({
  name: "model-catalog",
  provides: [ModelCatalog],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
