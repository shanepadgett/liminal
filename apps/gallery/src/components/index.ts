import type { Group } from "../entries.ts";
import { composerStates } from "./chat/Composer.states.tsx";
import { headerStates } from "./chat/Header.states.tsx";
import { sidebarStates } from "./chat/Sidebar.states.tsx";
import { toastStates } from "./chat/Toast.states.tsx";
import { commandsStates } from "./dialogs/Commands.states.tsx";
import { connectStates } from "./dialogs/Connect.states.tsx";
import { modelsStates } from "./dialogs/Models.states.tsx";
import { sessionsStates } from "./dialogs/Sessions.states.tsx";
import { noticeStates } from "./transcript/Notice.states.tsx";
import { replyStates } from "./transcript/Reply.states.tsx";
import { turnStates } from "./transcript/Turn.states.tsx";
import { workRowsStates } from "./transcript/WorkRows.states.tsx";

export const components: Group = {
  title: "Components",
  sections: [
    {
      title: "Chat",
      entries: [
        { id: "header", title: "Header", states: headerStates },
        { id: "composer", title: "Composer", states: composerStates },
        { id: "sidebar", title: "Sidebar", states: sidebarStates },
        { id: "toast", title: "Toast", states: toastStates },
      ],
    },
    {
      title: "Transcript",
      entries: [
        { id: "turn", title: "Turn", states: turnStates },
        { id: "reply", title: "Reply", states: replyStates },
        { id: "work-rows", title: "Work rows", states: workRowsStates },
        { id: "notice", title: "Notice", states: noticeStates },
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
