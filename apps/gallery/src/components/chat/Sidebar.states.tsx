import type { ComponentProps } from "solid-js";

import type { State } from "../../entries.ts";
import { Sidebar } from "./Sidebar.tsx";

/** A session well under way, for the sidebar's own states and the chat screen. */
export const SAMPLE_SIDEBAR: ComponentProps<typeof Sidebar> = {
  folder: "~/dev/liminal",
  branch: "main",
  usage: { context: 86_000, contextWindow: 200_000, cacheHit: 0.912, cost: 0.84, unpriced: 0 },
};

const sidebar = (props: ComponentProps<typeof Sidebar>) => () => (
  <box height="100%" alignItems="flex-end" paddingTop={1}>
    <box width={36}>
      <Sidebar {...props} />
    </box>
  </box>
);

export const sidebarStates: readonly [State, ...State[]] = [
  { name: "In use", fill: "screen", view: sidebar(SAMPLE_SIDEBAR) },
  {
    name: "Near the limit",
    fill: "screen",
    view: sidebar({
      ...SAMPLE_SIDEBAR,
      usage: { ...SAMPLE_SIDEBAR.usage, context: 181_000, cost: 3.27, unpriced: 2 },
    }),
  },
  {
    name: "No price or window",
    fill: "screen",
    view: sidebar({ ...SAMPLE_SIDEBAR, usage: { context: 42_000, cacheHit: 0.5, unpriced: 4 } }),
  },
  {
    name: "Fresh",
    fill: "screen",
    view: sidebar({ folder: "~/notes", usage: { context: 0, cacheHit: 0, cost: 0, unpriced: 0 } }),
  },
];
