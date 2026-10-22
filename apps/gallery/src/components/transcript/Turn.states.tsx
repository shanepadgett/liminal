import type { State } from "../../entries.ts";
import { Notice } from "./Notice.tsx";
import { Reply } from "./Reply.tsx";
import { ANSWER, QUESTION, READING, STREAMING } from "./samples.ts";
import { Turn } from "./Turn.tsx";
import { WorkRows } from "./WorkRows.tsx";

export const turnStates: readonly [State, ...State[]] = [
  {
    name: "Answered",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <WorkRows rows={READING.map((row) => ({ ...row, status: "done" }))} />
        <Reply text={ANSWER} isStreaming={false} />
      </Turn>
    ),
  },
  {
    name: "Streaming",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <WorkRows rows={READING} />
        <Reply text={STREAMING} isStreaming />
      </Turn>
    ),
  },
  {
    name: "Retried, then failed",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <Notice kind="warning" text="The provider is overloaded (529). Retrying in 4s." />
        <Notice kind="error" text="The provider is still overloaded after 3 tries." />
      </Turn>
    ),
  },
];
