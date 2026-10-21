/** Command-runner: starts the commands tools run, with no jail. */

import { definePlugin } from "@liminal/sdk";

import { CommandRunner } from "./src/contract.ts";

export default definePlugin({
  name: "command-runner",
  provides: [CommandRunner],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
