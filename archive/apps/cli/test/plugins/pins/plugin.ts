/**
 * Pins: a third-party plugin, outside the workspace, that extends the built-ins through their
 * published contracts. Its server saves a `pins/pin` entry; its TUI part draws it in the chat
 * transcript.
 */

import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";

import { Pins } from "./src/contract.ts";

export default definePlugin({
  name: "pins",
  provides: [Pins],
  requires: [SessionLog, EntryKinds],
  uses: [],
  enabledByDefault: true,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
