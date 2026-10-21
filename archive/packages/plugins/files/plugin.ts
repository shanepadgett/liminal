/**
 * Files: reads and writes files in the workspace for the tools that work on them, and offers the
 * workspace's files and folders as `@` tags.
 */

import { TagSources } from "@liminal/inbox/contract";
import { definePlugin } from "@liminal/sdk";

import { WorkspaceFiles } from "./src/contract.ts";

export default definePlugin({
  name: "files",
  provides: [WorkspaceFiles],
  requires: [],
  uses: [TagSources],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
});
