import type { State } from "../../entries.ts";
import { Sidebar, type SidebarModel } from "./Sidebar.tsx";

export const SAMPLE_MODEL: SidebarModel = {
  provider: "Anthropic",
  name: "claude-sonnet-4.5",
  role: "main",
};

const sidebar = (used: number) => () => (
  <box height="100%" alignItems="flex-end">
    <Sidebar
      title="Sorting out the plugin host"
      started="2h ago"
      model={SAMPLE_MODEL}
      used={used}
      limit={200_000}
    />
  </box>
);

export const sidebarStates: readonly [State, ...State[]] = [
  { name: "Fresh", fill: "screen", view: sidebar(4200) },
  { name: "In use", fill: "screen", view: sidebar(86_000) },
  { name: "Near the limit", fill: "screen", view: sidebar(181_000) },
];
