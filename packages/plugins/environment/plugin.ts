/**
 * Environment: the facts of the workspace and its files, kept current in the prompt, and the
 * sidebar's Session section with the folder and git branch.
 */

import { CommandRunner } from "@liminal/command-runner/contract";
import { PromptSections } from "@liminal/context/contract";
import { definePlugin } from "@liminal/sdk";

import { EnvironmentRpcs, environmentPlugin } from "./src/contract.ts";

export default definePlugin({
  name: environmentPlugin,
  provides: [],
  requires: [PromptSections, CommandRunner],
  uses: [],
  enabledByDefault: true,
  rpcs: EnvironmentRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
