import type { State } from "../../entries.ts";
import { Porter } from "../../primitives/Porter.tsx";
import { Notice } from "./Notice.tsx";
import { StreamingAnswer } from "./Reply.states.tsx";
import { Reply } from "./Reply.tsx";
import { ANSWER, LONG_QUESTION, QUESTION } from "./samples.ts";
import { Turn } from "./Turn.tsx";
import { READ } from "./work-samples.tsx";
import { WorkRows } from "./WorkRows.tsx";

export const turnStates: readonly [State, ...State[]] = [
  {
    name: "Answered",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <WorkRows rows={READ} />
        <Reply text={ANSWER} />
      </Turn>
    ),
  },
  {
    name: "Long input",
    fill: "page",
    view: () => (
      <Turn input={LONG_QUESTION}>
        <WorkRows rows={READ} />
      </Turn>
    ),
  },
  {
    name: "Thinking",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <Porter />
      </Turn>
    ),
  },
  {
    name: "Streaming",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <WorkRows rows={READ} />
        <StreamingAnswer />
      </Turn>
    ),
  },
  {
    name: "Retried, then failed",
    fill: "page",
    view: () => (
      <Turn input={QUESTION}>
        <Notice level="warning" text="The provider is overloaded. Trying again, attempt 2." />
        <Notice level="error" text="The turn stopped: the provider is still overloaded." />
      </Turn>
    ),
  },
];
