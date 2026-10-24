import type { State } from "../../entries.ts";
import { Memory } from "./Memory.tsx";
import { MEMORY_LINE } from "./samples.ts";
import { READ } from "./work-samples.tsx";
import { WorkRows } from "./WorkRows.tsx";

export const memoryStates: readonly [State, ...State[]] = [
  {
    name: "Kinds",
    fill: "page",
    view: () => (
      <box gap={1}>
        <Memory kind="entries" text={MEMORY_LINE} />
        <Memory kind="compacted" text="Each database keeps one migration until milestone 3" />
      </box>
    ),
  },
  {
    name: "Among tool calls",
    fill: "page",
    view: () => (
      <box gap={1}>
        <WorkRows rows={READ} />
        <Memory kind="entries" text={MEMORY_LINE} />
      </box>
    ),
  },
];
