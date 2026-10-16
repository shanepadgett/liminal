/**
 * The form of questions that takes over the composer when the assistant asks: one tab per question
 * and one for additional context, the row under the cursor, what the user has answered and noted so
 * far. Questions left open are sent as skipped.
 */

import type { Question } from "../transcript2/script.ts";
import type { Hint } from "./Hints.tsx";

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

export type FormState = {
  readonly title: string;
  readonly questions: readonly Question[];
  readonly drafts: readonly Draft[];
  readonly context: string;
  /** A question's index, or `questions.length` for additional context. */
  readonly tab: number;
  readonly row: number;
  /** The option whose note is being written. */
  readonly noting: number | undefined;
};

export const isAnswered = (draft: Draft) => {
  if (draft.kind === "text") return draft.text.trim() !== "";

  return draft.picked !== undefined && (draft.picked !== "own" || draft.own.trim() !== "");
};

/** The row of a select question where the user writes their own answer, past its options. */
export const ownRowOf = (question: Question) =>
  question.kind === "select" ? question.options.length : undefined;

const CHOOSING: readonly Hint[] = [
  ["↑↓", "choose"],
  ["enter", "pick"],
  ["n", "note"],
  ["tab", "next"],
  ["esc", "cancel"],
];

const NOTING: readonly Hint[] = [
  ["enter", "save note"],
  ["esc", "drop note"],
];

const WRITING: readonly Hint[] = [
  ["enter", "accept"],
  ["tab", "next"],
  ["esc", "cancel"],
];

const CONTEXT: readonly Hint[] = [
  ["enter", "send answers"],
  ["shift+tab", "back"],
  ["esc", "cancel"],
];

/** What the keys do on the tab in view. */
export const formHintsOf = (form: FormState): readonly Hint[] => {
  const question = form.questions.at(form.tab);

  if (question === undefined) return CONTEXT;
  if (form.noting !== undefined) return NOTING;
  if (question.kind === "input" || form.row === ownRowOf(question)) return WRITING;

  return CHOOSING;
};
