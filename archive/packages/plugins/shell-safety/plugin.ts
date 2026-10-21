/** Shell safety: tells read-only shell commands apart from ones that can change things. */

import { definePlugin } from "@liminal/sdk";

import { ShellSafety } from "./src/contract.ts";

export default definePlugin({
  name: "shell-safety",
  provides: [ShellSafety],
  requires: [],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
