/** Sample asks: tool calls waiting for approval, and a form of questions at each step. */

import type { ApprovalCall } from "./Approval.tsx";
import type { Draft, Form, Question } from "./form.ts";

export const SHELL_CALL: ApprovalCall = {
  tool: "shell",
  explanation: "Deletes every installed package in the workspace, then installs them again.",
};

/** The command behind `SHELL_CALL`, shown in its transcript row. */
export const SHELL_INPUT = "rm -rf node_modules packages/*/node_modules && bun install";

export const FORM_TITLE = "Before I rewrite the concurrency test";

const QUESTIONS: readonly Question[] = [
  {
    kind: "select",
    prompt: "How should the test tell that two plugins started together?",
    options: [
      { label: "Spans overlap", description: "each starts before the other finishes" },
      { label: "Starts close together", description: "both start within a few milliseconds" },
      { label: "Neither waits", description: "no plugin awaits another's start" },
    ],
    recommendation: {
      answer: "Spans overlap",
      reason: "It holds on a slow machine, where start times drift apart.",
    },
  },
  {
    kind: "confirm",
    prompt: "Can bootAndRecord return when each plugin finished, as well as when it started?",
    recommendation: { answer: "Yes", reason: "The overlap check needs both ends of each span." },
  },
  {
    kind: "input",
    prompt: "What should the test be called?",
    recommendation: {
      answer: "starts independent plugins concurrently",
      reason: "It says what is checked, not how.",
    },
  },
  {
    kind: "select",
    prompt: "Where should the overlap check live?",
    options: [
      { label: "In host.test.ts", description: "next to the one test that uses it" },
      { label: "In test/support.ts", description: "beside bootAndRecord" },
    ],
  },
];

const OPEN_CHOICE: Draft = { kind: "choice", picked: undefined, own: "", notes: {} };

const UNANSWERED: readonly Draft[] = QUESTIONS.map((question): Draft =>
  question.kind === "input" ? { kind: "text", text: "" } : OPEN_CHOICE,
);

const ANSWERED: readonly Draft[] = [
  { kind: "choice", picked: 0, own: "", notes: { 1: "CI is slow, so no timing margins." } },
  { kind: "choice", picked: 0, own: "", notes: {} },
  { kind: "text", text: "runs independent plugins at the same time" },
  { kind: "choice", picked: "own", own: "Inline it. It is one comparison.", notes: {} },
];

/**
 * Answered up to the question at `tab`, which is in view with `draft` given and the cursor on
 * `row`.
 */
const formAt = (tab: number, row: number, draft?: Draft): Form => ({
  title: FORM_TITLE,
  questions: QUESTIONS,
  drafts: UNANSWERED.map((open, index) => {
    if (index === tab) return draft ?? open;

    return index < tab ? (ANSWERED[index] ?? open) : open;
  }),
  context: "",
  tab,
  row,
});

export const FORM_CHOOSING = formAt(0, 1);

export const FORM_NOTING: Form = {
  ...formAt(0, 1, { kind: "choice", picked: 0, own: "", notes: { 1: "CI is slow" } }),
  noting: 1,
};

export const FORM_CONFIRMING = formAt(1, 0);

export const FORM_WRITING = formAt(2, 0, { kind: "text", text: "runs independent plugins" });

export const FORM_OWN = formAt(3, 2, {
  kind: "choice",
  picked: "own",
  own: "Inline it.",
  notes: {},
});

export const FORM_CONTEXT: Form = {
  ...formAt(QUESTIONS.length, 0),
  drafts: ANSWERED,
  context: "Keep the test under twenty lines.",
};
