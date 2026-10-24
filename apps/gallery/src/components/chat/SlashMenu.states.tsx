import type { State } from "../../entries.ts";
import { type SlashCommand, SlashMenu } from "./SlashMenu.tsx";

/** The product's slash commands, in the order the menu lists them. */
export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "connect", title: "Connect a provider" },
  { name: "disconnect", title: "Disconnect a provider" },
  { name: "model", title: "Switch model" },
  { name: "theme", title: "Switch theme" },
  { name: "new", title: "New session" },
  { name: "qna", title: "Ask me your questions", argument: { kind: "optional", hint: "topic" } },
  { name: "commit", title: "Commit changes", argument: { kind: "optional", hint: "guidance" } },
  { name: "pop", title: "Stashed drafts" },
  { name: "sessions", title: "Open a session" },
];

/** A command whose text is required, as `/btw` will be. */
const WITH_REQUIRED: readonly SlashCommand[] = [
  ...SLASH_COMMANDS,
  { name: "btw", title: "Ask on the side", argument: { kind: "required", hint: "question" } },
];

const menu =
  (typed: string, under: number, commands = SLASH_COMMANDS) =>
  () => (
    <box width={72} paddingX={2}>
      <SlashMenu commands={commands} typed={typed} under={under} />
    </box>
  );

export const slashMenuStates: readonly [State, ...State[]] = [
  { name: "Just a slash", fill: "center", view: menu("", 2) },
  { name: "Filtered", fill: "center", view: menu("co", 0) },
  { name: "Takes text", fill: "center", view: menu("c", 1) },
  { name: "Required text", fill: "center", view: menu("b", 0, WITH_REQUIRED) },
  { name: "No matches", fill: "center", view: menu("xyzzy", 0) },
];
