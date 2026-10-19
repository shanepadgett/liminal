/**
 * Skills: Agent Skills folders, `<name>/SKILL.md`, from the user's and, in a trusted workspace, the
 * project's skills folders. The model sees a list and reads a skill when its task comes up; the
 * user starts one with `/<name>` or tags it with `@skill:<name>`.
 */

import { PromptSections } from "@liminal/context/contract";
import { Inbox, TagSources } from "@liminal/inbox/contract";
import { definePlugin } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";

import { SkillsRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "skills",
  provides: [],
  requires: [PromptSections, SessionLog, Inbox],
  uses: [TagSources],
  enabledByDefault: true,
  rpcs: SkillsRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
