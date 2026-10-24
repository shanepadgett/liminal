import type { State } from "../../entries.ts";
import { Checkpoint } from "./Checkpoint.tsx";
import { Memory } from "./Memory.tsx";
import { READ, SHORT_TERM_MEMORY } from "./samples.ts";
import { WorkRows } from "./WorkRows.tsx";

export const checkpointStates: readonly [State, ...State[]] = [
  { name: "Files read", fill: "page", view: () => <Checkpoint filesRead={6} /> },
  { name: "One file read", fill: "page", view: () => <Checkpoint filesRead={1} /> },
  { name: "After the cache was lost", fill: "page", view: () => <Checkpoint filesRead={0} /> },
  {
    name: "Among tool calls and a memory",
    fill: "page",
    view: () => (
      <box gap={1}>
        <WorkRows rows={READ} />
        <Memory kind="short-term" text={SHORT_TERM_MEMORY} />
        <Checkpoint filesRead={6} />
        <WorkRows rows={READ} />
      </box>
    ),
  },
];
