/** Tool-guidance: tells the model how to use the registered tools. */

import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

import { toolGuidancePlugin } from "./src/contract.ts";

export default definePlugin({
  name: toolGuidancePlugin,
  provides: [],
  requires: [Tools, PromptSections],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
