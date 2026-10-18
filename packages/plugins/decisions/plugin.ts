/** Decisions: the decision models providers register, and the service that asks one. */

import { definePlugin } from "@liminal/sdk";

import { DecisionModels, Decisions } from "./src/contract.ts";

export default definePlugin({
  name: "decisions",
  provides: [DecisionModels, Decisions],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
