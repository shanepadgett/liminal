/**
 * Questions: `/qna` asks the model for the questions it still needs answered; its `ask_question`
 * call ends the turn with a form in the composer, and the user's answers are their next message.
 */

import { BeforeCallHooks } from "@liminal/agent-loop/contract";
import { Inbox } from "@liminal/inbox/contract";
import { definePlugin } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

import { QuestionsRpcs } from "./src/contract.ts";

export default definePlugin({
  name: "questions",
  provides: [],
  requires: [SessionLog, EntryKinds, Tools, BeforeCallHooks, Inbox],
  uses: [],
  enabledByDefault: true,
  rpcs: QuestionsRpcs,
  server: () => import("./src/server.ts"),
  tui: () => import("./src/tui.tsx"),
});
