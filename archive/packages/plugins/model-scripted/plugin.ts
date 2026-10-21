/** Model-scripted: a provider that plays scripted replies, for tests. */

import { ModelProviders } from "@liminal/models/contract";
import { definePlugin } from "@liminal/sdk";

import { ScriptedModel } from "./src/contract.ts";

export default definePlugin({
  name: "model-scripted",
  provides: [ScriptedModel],
  requires: [ModelProviders],
  uses: [],
  enabledByDefault: false,
  server: () => import("./src/server.ts"),
});
