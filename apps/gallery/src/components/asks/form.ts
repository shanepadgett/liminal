/**
 * The model's questions and the form the user answers them in: one tab per question and a last one
 * for additional notes: anything else the model should know. Questions left open are sent as
 * skipped.
 */

import type { Hint } from "../../primitives/Hints.tsx";

export interface AnswerOption {
  readonly label: string;
  readonly description?: string;
}

/** The answer the model suggests, and why. */
export interface Recommendation {
  readonly answer: string;
  readonly reason: string;
}

interface Asked {
  readonly prompt: string;
  readonly recommendation?: Recommendation;
}

export type Question =
  | (Asked & { readonly kind: "select"; readonly options: readonly AnswerOption[] })
  | (Asked & { readonly kind: "confirm" })
  | (Asked & { readonly kind: "input" });

const YES_NO: readonly AnswerOption[] = [{ label: "Yes" }, { label: "No" }];

export const optionsOf = (question: Question): readonly AnswerOption[] => {
  if (question.kind === "select") return question.options;

  return question.kind === "confirm" ? YES_NO : [];
};

/** What the user has given a question so far. */
export type Draft =
  | {
      readonly kind: "choice";
      /** An option's index, `"own"` for the user's own answer, or none yet. */
      readonly picked: number | "own" | undefined;
      readonly own: string;
      /** The user's note on the option they picked, such as why they picked it. */
      readonly note: string;
    }
  | { readonly kind: "text"; readonly text: string };

export interface Form {
  readonly title: string;
  readonly questions: readonly Question[];
  readonly drafts: readonly Draft[];
  /** Anything else the user wants the model to know. */
  readonly additionalNotes: string;
  /** A question's index, or `questions.length` for the additional notes tab. */
  readonly tab: number;
  /** The row under the cursor in a question with options. */
  readonly row: number;
  /** Whether the note on the picked option is being written. */
  readonly isNoting?: boolean;
}

export const isAnswered = (draft: Draft) => {
  if (draft.kind === "text") return draft.text.trim() !== "";

  return draft.picked !== undefined && (draft.picked !== "own" || draft.own.trim() !== "");
};

/** The row of a select question where the user writes their own answer, past its options. */
export const ownRowOf = (question: Question) =>
  question.kind === "select" ? question.options.length : undefined;

/** Which of the form's keys work on the tab in view. */
const keysOn = (form: Form) => {
  const question = form.questions.at(form.tab);
  const isNoting = form.isNoting === true;
  const isQuestion = question !== undefined && !isNoting;
  const isField = isQuestion && (question.kind === "input" || form.row === ownRowOf(question));
  const hasRows = isQuestion && question.kind !== "input";

  return {
    hasRows,
    isField,
    isOnOption: hasRows && !isField,
    isNoting,
    isOnNotes: question === undefined,
    isQuestion,
    canGoBack: !isNoting && form.tab > 0,
  };
};

/** What the keys do on the tab in view, in the order the form's commands come. */
export const formHintsOf = (form: Form): readonly Hint[] => {
  const on = keysOn(form);

  const hints: readonly (readonly [boolean, Hint])[] = [
    [on.hasRows, { keys: "↑↓", label: "choose" }],
    [on.isOnOption, { keys: "enter", label: "pick" }],
    [on.isField, { keys: "enter", label: "accept" }],
    [on.isOnOption, { keys: "n", label: "note" }],
    [on.isNoting, { keys: "enter", label: "save note" }],
    [on.isNoting, { keys: "esc", label: "drop note" }],
    [on.isOnNotes, { keys: "enter", label: "send answers" }],
    [on.isQuestion, { keys: "tab", label: "next" }],
    [on.canGoBack, { keys: "shift+tab", label: "back" }],
    [!on.isNoting, { keys: "esc", label: "cancel" }],
  ];

  return hints.flatMap(([isShown, hint]) => (isShown ? [hint] : []));
};
