/** System-prompt: the built-in base instructions every session starts with. */

import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";

import { systemPromptPlugin } from "./src/contract.ts";

export default definePlugin({
  name: systemPromptPlugin,
  provides: [],
  requires: [PromptSections],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
