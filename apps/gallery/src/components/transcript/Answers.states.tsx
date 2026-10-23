import type { State } from "../../entries.ts";
import type { Draft } from "../asks/form.ts";
import { FORM_ANSWERED, FORM_TITLE, QUESTIONS } from "../asks/samples.ts";
import { Answers, answersOf } from "./Answers.tsx";
import { READ } from "./samples.ts";
import { type WorkRow, WorkRows } from "./WorkRows.tsx";

const SKIPPED: Draft = { kind: "choice", picked: undefined, own: "", note: "" };

/** Three answered, the yes-or-no question skipped. */
const ANSWERS = answersOf(
  QUESTIONS,
  FORM_ANSWERED.with(1, SKIPPED),
  "Keep the test under twenty lines.",
);

const askRow = (row: Partial<WorkRow>): WorkRow => ({
  tool: "ask",
  input: FORM_TITLE,
  status: "done",
  note: "3 answered, 1 skipped",
  ...row,
});

const rowsWith = (row: Partial<WorkRow>) => [...READ, askRow(row)];

export const answersStates: readonly [State, ...State[]] = [
  {
    name: "Answered",
    fill: "page",
    view: () => (
      <box>
        <WorkRows rows={rowsWith({})} />
        <Answers answers={ANSWERS} />
      </box>
    ),
  },
  {
    name: "Waiting",
    fill: "page",
    view: () => <WorkRows rows={rowsWith({ status: "running", note: "waiting for you" })} />,
  },
  {
    name: "Cancelled",
    fill: "page",
    view: () => <WorkRows rows={rowsWith({ status: "failed", note: "cancelled" })} />,
  },
];
