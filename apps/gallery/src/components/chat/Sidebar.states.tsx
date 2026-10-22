import type { ComponentProps } from "solid-js";

import type { State } from "../../entries.ts";
import { Sidebar } from "./Sidebar.tsx";

/** A session well under way, for the sidebar's own states and the chat screen. */
export const SAMPLE_SIDEBAR: ComponentProps<typeof Sidebar> = {
  folder: "~/dev/liminal",
  branch: "main",
  context: {
    used: 86_000,
    limit: 200_000,
    shortTermMemories: 12,
    longTermMemories: 4,
    checkpoints: 3,
  },
  references: ["effect", "opentui", "crush"],
  servers: ["typescript", "oxlint"],
};

const sidebar = (props: ComponentProps<typeof Sidebar>) => () => (
  <box height="100%" alignItems="flex-end" paddingTop={1}>
    <Sidebar {...props} />
  </box>
);

export const sidebarStates: readonly [State, ...State[]] = [
  { name: "In use", fill: "screen", view: sidebar(SAMPLE_SIDEBAR) },
  {
    name: "Near the limit",
    fill: "screen",
    view: sidebar({
      ...SAMPLE_SIDEBAR,
      context: { ...SAMPLE_SIDEBAR.context, used: 181_000, checkpoints: 9 },
    }),
  },
  {
    name: "Fresh",
    fill: "screen",
    view: sidebar({
      folder: "~/notes",
      context: {
        used: 4200,
        limit: 200_000,
        shortTermMemories: 0,
        longTermMemories: 4,
        checkpoints: 0,
      },
      references: [],
      servers: [],
    }),
  },
];
