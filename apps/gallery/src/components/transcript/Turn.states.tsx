import type { State } from "../../entries.ts";
import { Spinner } from "../../primitives/Spinner.tsx";
import { Notice } from "./Notice.tsx";
import { StreamingAnswer } from "./Reply.states.tsx";
import { Reply } from "./Reply.tsx";
import { ANSWER, LONG_QUESTION, QUESTION, READ } from "./samples.ts";
import { Turn } from "./Turn.tsx";
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
        <Spinner />
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
        <Notice kind="warning" text="The provider is overloaded (529). Retrying in 4s." />
        <Notice kind="error" text="The provider is still overloaded after 3 tries." />
      </Turn>
    ),
  },
];
