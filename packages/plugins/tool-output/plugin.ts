/**
 * Tool output: keeps each call's output within limits the model can take in; the whole output of a
 * longer one goes to a private file the model can read.
 */

import { definePlugin } from "@liminal/sdk";
import { ToolWrappers } from "@liminal/tools/contract";

import { LongOutput } from "./src/contract.ts";

export default definePlugin({
  name: "tool-output",
  provides: [LongOutput],
  requires: [ToolWrappers],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
