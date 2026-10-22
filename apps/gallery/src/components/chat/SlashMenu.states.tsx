import type { State } from "../../entries.ts";
import { type SlashCommand, SlashMenu } from "./SlashMenu.tsx";

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "new", description: "Start a new session" },
  { name: "sessions", description: "Open another session" },
  { name: "model", description: "Switch the model for a role" },
  { name: "connect", description: "Sign in to a provider" },
  { name: "logout", description: "Sign out of a provider" },
  { name: "compact", description: "Fold the session to free context" },
  { name: "copy", description: "Copy the last reply" },
  { name: "qna", description: "Ask the model to question you before it works" },
  { name: "palette", description: "Change the colors" },
  { name: "quit", description: "Quit Liminal" },
];

const menu = (typed: string, under: number) => () => (
  <box width={72} paddingX={2}>
    <SlashMenu commands={SLASH_COMMANDS} typed={typed} under={under} />
  </box>
);

export const slashMenuStates: readonly [State, ...State[]] = [
  { name: "Just a slash", fill: "center", view: menu("", 2) },
  { name: "Filtered", fill: "center", view: menu("co", 0) },
  { name: "No matches", fill: "center", view: menu("xyzzy", 0) },
];
