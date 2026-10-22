import type { Group } from "../entries.ts";
import { chatStates } from "./Chat.states.tsx";

export const screens: Group = {
  title: "Screens",
  sections: [{ title: "Chat", entries: [{ id: "chat", title: "Chat", states: chatStates }] }],
};
