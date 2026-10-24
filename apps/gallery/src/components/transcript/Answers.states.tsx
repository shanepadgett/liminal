import type { State } from "../../entries.ts";
import type { Draft } from "../asks/form.ts";
import { FORM_ANSWERED, FORM_TITLE, QUESTIONS } from "../asks/samples.ts";
import { Answers, answersOf } from "./Answers.tsx";
import { READ } from "./work-samples.tsx";
import { type WorkRow, WorkRows } from "./WorkRows.tsx";

const SKIPPED: Draft = { kind: "choice", picked: undefined, own: "", note: "" };

/** Three answered, the yes-or-no question skipped. */
const ANSWERS = answersOf(
  QUESTIONS,
  FORM_ANSWERED.with(1, SKIPPED),
  "Keep the test under twenty lines.",
);

/** The ask's row: the form's title and how it was answered, opening the answers on a click. */
const askRow = (status: string, row: Partial<WorkRow> = {}): WorkRow => ({
  tool: "ask",
  input: `${FORM_TITLE}  ${status}`,
  status: "done",
  ...row,
});

const rowsWith = (row: WorkRow) => [...READ, row];

export const answersStates: readonly [State, ...State[]] = [
  {
    name: "Answered",
    fill: "page",
    view: () => <WorkRows rows={rowsWith(askRow("3 answered, 1 skipped"))} />,
  },
  {
    name: "Answers opened",
    fill: "page",
    view: () => (
      <WorkRows
        rows={rowsWith(
          askRow("3 answered, 1 skipped", {
            details: () => <Answers answers={ANSWERS} />,
            isOpen: true,
          }),
        )}
      />
    ),
  },
  {
    name: "Waiting",
    fill: "page",
    view: () => <WorkRows rows={rowsWith(askRow("waiting for you", { status: "running" }))} />,
  },
  {
    name: "Cancelled",
    fill: "page",
    view: () => <WorkRows rows={rowsWith(askRow("cancelled", { status: "failed" }))} />,
  },
];
