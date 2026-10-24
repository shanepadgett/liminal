import type { State } from "../../entries.ts";
import { Checkpoint } from "./Checkpoint.tsx";
import { Memory } from "./Memory.tsx";
import { MEMORY_LINE } from "./samples.ts";
import { READ } from "./work-samples.tsx";
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
        <Memory kind="entries" text={MEMORY_LINE} />
        <Checkpoint filesRead={6} />
        <WorkRows rows={READ} />
      </box>
    ),
  },
];
