/**
 * The model's questions and the form the user answers them in: one tab per question and a last one
 * for anything else the model should know. Questions left open are sent as skipped.
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
      /** The user's notes by option index. */
      readonly notes: Readonly<Record<number, string>>;
    }
  | { readonly kind: "text"; readonly text: string };

export interface Form {
  readonly title: string;
  readonly questions: readonly Question[];
  readonly drafts: readonly Draft[];
  readonly context: string;
  /** A question's index, or `questions.length` for the context tab. */
  readonly tab: number;
  /** The row under the cursor in a question with options. */
  readonly row: number;
  /** The option whose note is being written. */
  readonly noting?: number;
}

export const isAnswered = (draft: Draft) => {
  if (draft.kind === "text") return draft.text.trim() !== "";

  return draft.picked !== undefined && (draft.picked !== "own" || draft.own.trim() !== "");
};

/** The row of a select question where the user writes their own answer, past its options. */
export const ownRowOf = (question: Question) =>
  question.kind === "select" ? question.options.length : undefined;

const CHOOSING: readonly Hint[] = [
  { keys: "↑↓", label: "choose" },
  { keys: "enter", label: "pick" },
  { keys: "n", label: "note" },
  { keys: "tab", label: "next" },
  { keys: "esc", label: "cancel" },
];

const NOTING: readonly Hint[] = [
  { keys: "enter", label: "save note" },
  { keys: "esc", label: "drop note" },
];

const WRITING: readonly Hint[] = [
  { keys: "enter", label: "accept" },
  { keys: "tab", label: "next" },
  { keys: "esc", label: "cancel" },
];

const CONTEXT: readonly Hint[] = [
  { keys: "enter", label: "send answers" },
  { keys: "shift+tab", label: "back" },
  { keys: "esc", label: "cancel" },
];

/** What the keys do on the tab in view. */
export const formHintsOf = (form: Form): readonly Hint[] => {
  const question = form.questions.at(form.tab);

  if (question === undefined) return CONTEXT;
  if (form.noting !== undefined) return NOTING;
  if (question.kind === "input" || form.row === ownRowOf(question)) return WRITING;

  return CHOOSING;
};
