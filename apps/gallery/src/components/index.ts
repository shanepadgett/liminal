import type { Group } from "../entries.ts";
import { approvalStates } from "./asks/Approval.states.tsx";
import { askStates } from "./asks/Ask.states.tsx";
import { questionsStates } from "./asks/Questions.states.tsx";
import { composerStates } from "./chat/Composer.states.tsx";
import { headerStates } from "./chat/Header.states.tsx";
import { landingStates } from "./chat/Landing.states.tsx";
import { notificationsStates } from "./chat/Notifications.states.tsx";
import { sidebarStates } from "./chat/Sidebar.states.tsx";
import { slashMenuStates } from "./chat/SlashMenu.states.tsx";
import { commandsStates } from "./dialogs/Commands.states.tsx";
import { connectStates } from "./dialogs/Connect.states.tsx";
import { modelsStates } from "./dialogs/Models.states.tsx";
import { sessionsStates } from "./dialogs/Sessions.states.tsx";
import { answersStates } from "./transcript/Answers.states.tsx";
import { checkpointStates } from "./transcript/Checkpoint.states.tsx";
import { memoryStates } from "./transcript/Memory.states.tsx";
import { noticeStates } from "./transcript/Notice.states.tsx";
import { replyStates } from "./transcript/Reply.states.tsx";
import { turnStates } from "./transcript/Turn.states.tsx";
import { turnEndStates } from "./transcript/TurnEnd.states.tsx";
import { workRowsStates } from "./transcript/WorkRows.states.tsx";

export const components: Group = {
  title: "Components",
  sections: [
    {
      title: "Chat",
      entries: [
        { id: "header", title: "Header", states: headerStates },
        { id: "landing", title: "Landing", states: landingStates },
        { id: "composer", title: "Composer", states: composerStates },
        { id: "slash-menu", title: "Slash menu", states: slashMenuStates },
        { id: "sidebar", title: "Sidebar", states: sidebarStates },
        { id: "notifications", title: "Notifications", states: notificationsStates },
      ],
    },
    {
      title: "Transcript",
      entries: [
        { id: "turn", title: "Turn", states: turnStates },
        { id: "reply", title: "Reply", states: replyStates },
        { id: "work-rows", title: "Work rows", states: workRowsStates },
        { id: "answers", title: "Answers", states: answersStates },
        { id: "notice", title: "Notice", states: noticeStates },
        { id: "turn-end", title: "Turn end", states: turnEndStates },
        { id: "memory", title: "Memory", states: memoryStates },
        { id: "checkpoint", title: "Checkpoint", states: checkpointStates },
      ],
    },
    {
      title: "Asks",
      entries: [
        { id: "ask", title: "Ask", states: askStates },
        { id: "approval", title: "Approval", states: approvalStates },
        { id: "questions", title: "Questions", states: questionsStates },
      ],
    },
    {
      title: "Dialogs",
      entries: [
        { id: "commands", title: "Commands", states: commandsStates },
        { id: "models", title: "Models", states: modelsStates },
        { id: "sessions", title: "Sessions", states: sessionsStates },
        { id: "connect", title: "Connect", states: connectStates },
      ],
    },
  ],
};
