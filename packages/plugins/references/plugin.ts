/**
 * References: read-only git clones of other repositories, kept in Liminal's data folder. A session
 * attaches some; the model is told where they are, and `@` tags reach them and their files.
 */

import { PromptSections } from "@liminal/context/contract";
import { TagSources } from "@liminal/inbox/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";

import { ReferencesRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "references",
  provides: [],
  requires: [SessionLog, EntryKinds, PromptSections],
  uses: [TagSources],
  enabledByDefault: true,
  rpcs: ReferencesRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
