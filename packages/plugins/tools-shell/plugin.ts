/** Shell tool: `shell` runs one command line and returns its output. */

import { CommandRunner } from "@liminal/command-runner/contract";
import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tool-registry/contract";

export default definePlugin({
  name: "tools-shell",
  provides: [],
  requires: [Tools, CommandRunner],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
