import type { State } from "../../entries.ts";
import { Memory } from "./Memory.tsx";
import { SHORT_TERM_MEMORY } from "./samples.ts";
import { READ } from "./work-samples.tsx";
import { WorkRows } from "./WorkRows.tsx";

export const memoryStates: readonly [State, ...State[]] = [
  {
    name: "Kinds",
    fill: "page",
    view: () => (
      <box gap={1}>
        <Memory kind="short-term" text={SHORT_TERM_MEMORY} />
        <Memory kind="long-term" text="Each database keeps one migration until milestone 3" />
      </box>
    ),
  },
  {
    name: "Among tool calls",
    fill: "page",
    view: () => (
      <box gap={1}>
        <WorkRows rows={READ} />
        <Memory kind="short-term" text={SHORT_TERM_MEMORY} />
      </box>
    ),
  },
];
