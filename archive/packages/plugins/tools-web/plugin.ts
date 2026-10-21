/**
 * Web tools: `websearch` asks the registered searchers in order, Exa last, and `webfetch` reads a
 * page as text.
 */

import { definePlugin } from "@liminal/sdk";
import { Tools } from "@liminal/tools/contract";

import { WebSearchers } from "./src/contract.ts";

export default definePlugin({
  name: "tools-web",
  provides: [WebSearchers],
  requires: [Tools],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
