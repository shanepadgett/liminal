/** Models: streams one model call through a registered provider. */

import { ModelCatalog } from "@liminal/model-catalog/contract";
import { definePlugin } from "@liminal/sdk";

import { ModelProviders, Models, ModelsRpcs, ModelTask } from "./src/contract.ts";

export default definePlugin({
  name: "models",
  provides: [Models, ModelProviders, ModelTask],
  requires: [ModelCatalog],
  uses: [],
  enabledByDefault: true,
  rpcs: ModelsRpcs,
  server: () => import("./src/server.ts"),
});
