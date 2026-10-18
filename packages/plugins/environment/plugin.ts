/** Environment: the facts of the workspace and its files, kept current in the prompt. */

import { CommandRunner } from "@liminal/command-runner/contract";
import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";

import { environmentPlugin } from "./src/contract.ts";

export default definePlugin({
  name: environmentPlugin,
  provides: [],
  requires: [PromptSections, CommandRunner],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
