/**
 * The form of questions the gallery's composer shows, at each step of answering it: the questions
 * The transcript's `/qna` turn drafts, answered the way its next prompt says they were.
 */

import { FORM_QUESTIONS, FORM_TITLE } from "../transcript/sample.ts";
import type { Draft, FormState } from "./formState.ts";

const OPEN_CHOICE: Draft = { kind: "choice", picked: undefined, own: "", notes: {} };

const UNANSWERED: readonly Draft[] = FORM_QUESTIONS.map((question): Draft =>
  question.kind === "input" ? { kind: "text", text: "" } : OPEN_CHOICE,
);

const ANSWERED: readonly Draft[] = [
  { kind: "choice", picked: 0, own: "", notes: { 1: "CI is slow, so no timing margins." } },
  { kind: "choice", picked: 0, own: "", notes: {} },
  { kind: "text", text: "runs independent plugins at the same time" },
  { kind: "choice", picked: "own", own: "Inline it. It is one comparison.", notes: {} },
];

const replaced = (drafts: readonly Draft[], at: number, draft: Draft) =>
  drafts.map((each, index) => (index === at ? draft : each));

/** Answered up to the question at `tab`, which is in view with the cursor on `row`. */
const formAt = (tab: number, row: number): FormState => ({
  title: FORM_TITLE,
  questions: FORM_QUESTIONS,
  drafts: UNANSWERED.map((draft, index) => (index < tab ? (ANSWERED[index] ?? draft) : draft)),
  context: "",
  tab,
  row,
  noting: undefined,
});

export const FORM_CHOOSING = formAt(0, 1);

export const FORM_NOTING: FormState = {
  ...FORM_CHOOSING,
  drafts: replaced(UNANSWERED, 0, { kind: "choice", picked: 0, own: "", notes: {} }),
  noting: 1,
};

export const FORM_CONFIRMING = formAt(1, 0);

const WRITING_AT = formAt(2, 0);

export const FORM_WRITING: FormState = {
  ...WRITING_AT,
  drafts: replaced(WRITING_AT.drafts, 2, { kind: "text", text: "runs independent plugins" }),
};

const OWN_AT = formAt(3, 2);

export const FORM_OWN: FormState = {
  ...OWN_AT,
  drafts: replaced(OWN_AT.drafts, 3, {
    kind: "choice",
    picked: "own",
    own: "Inline it.",
    notes: {},
  }),
};

export const FORM_CONTEXT: FormState = {
  ...formAt(4, 0),
  drafts: ANSWERED,
  context: "Keep the test under twenty lines.",
};

/** Ready to send with the yes-or-no question left open, which goes as skipped. */
export const FORM_SKIPPING: FormState = {
  ...FORM_CONTEXT,
  drafts: replaced(ANSWERED, 1, OPEN_CHOICE),
};
