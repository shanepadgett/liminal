/**
 * The form while the user answers: one tab per question and a last one for additional notes, the
 * row under the cursor, what each question has so far and the note being written. A choice question
 * holds one note, on the picked option. Questions left open are sent as skipped.
 */
import type { Answer, Answers, Form, Question } from "../contract.ts";
import { optionsOf } from "../contract.ts";

/** What the user has given a question so far. */
export type Draft =
  | {
      readonly kind: "choice";
      /** An option's index, `"own"` for the user's own answer, or none yet. */
      readonly picked: number | "own" | undefined;
      readonly own: string;
      /** The user's note on the option they picked. */
      readonly note: string;
    }
  | { readonly kind: "text"; readonly text: string };

type Choice = Extract<Draft, { kind: "choice" }>;

export interface FormState {
  readonly form: Form;
  readonly drafts: ReadonlyArray<Draft>;
  readonly notes: string;
  /** A question's index, or the number of questions for the notes tab. */
  readonly tab: number;
  readonly row: number;
  /** The note being written on the row under the cursor; none while no note is written. */
  readonly noting: string | undefined;
}

const draftOf = (question: Question): Draft =>
  question.kind === "input"
    ? { kind: "text", text: "" }
    : { kind: "choice", picked: undefined, own: "", note: "" };

export const formState = (form: Form): FormState => ({
  form,
  drafts: form.questions.map(draftOf),
  notes: "",
  tab: 0,
  row: 0,
  noting: undefined,
});

/** The question on the tab in view; none on the notes tab. */
export const questionOf = (state: FormState): Question | undefined =>
  state.form.questions.at(state.tab);

export const choiceOf = (state: FormState): Choice | undefined => {
  const draft = state.drafts.at(state.tab);

  return draft?.kind === "choice" ? draft : undefined;
};

/** The row of a select question where the user writes their own answer, past its options. */
export const ownRowOf = (question: Question) =>
  question.kind === "select" ? question.options.length : undefined;

/** Whether a field holds the keys: a note, the own answer, a written answer or the notes. */
export const isWriting = (state: FormState) => {
  const question = questionOf(state);
  if (question === undefined || state.noting !== undefined) return true;

  return question.kind === "input" || state.row === ownRowOf(question);
};

/** Whether the cursor is on one of a choice question's options. */
export const isOnOption = (state: FormState) => {
  const question = questionOf(state);

  return question !== undefined && question.kind !== "input" && !isWriting(state);
};

export const isAnswered = (draft: Draft) => {
  if (draft.kind === "text") return draft.text.trim() !== "";
  if (draft.picked === "own") return draft.own.trim() !== "";

  return draft.picked !== undefined;
};

const withDraft = (state: FormState, draft: Draft): FormState => ({
  ...state,
  drafts: state.drafts.map((each, index) => (index === state.tab ? draft : each)),
});

/** The row a tab opens on: its picked option or own answer, else the first row. */
const openingRow = (question: Question | undefined, draft: Draft | undefined) => {
  if (question === undefined || draft?.kind !== "choice" || draft.picked === undefined) return 0;

  return draft.picked === "own" ? optionsOf(question).length : draft.picked;
};

/** Moves `by` tabs, from the first question to the notes tab, to the new tab's picked row. */
export const moveTab = (state: FormState, by: number): FormState => {
  const tab = Math.min(Math.max(state.tab + by, 0), state.form.questions.length);
  const row = openingRow(state.form.questions.at(tab), state.drafts.at(tab));

  return { ...state, tab, row, noting: undefined };
};

/** Moves `by` rows within a choice tab's options and own row, wrapping. */
export const moveRow = (state: FormState, by: number): FormState => {
  const question = questionOf(state);
  if (question === undefined || question.kind === "input") return state;

  const rows = optionsOf(question).length + (question.kind === "select" ? 1 : 0);

  return { ...state, row: (state.row + by + rows) % rows };
};

/** The draft with `picked`; a new pick drops the note on the old one. */
const picking = (choice: Choice, picked: number | "own"): Choice => ({
  ...choice,
  picked,
  note: picked === choice.picked ? choice.note : "",
});

/** Picks the option under the cursor, or the own answer once written, then goes to the next tab. */
export const pick = (state: FormState): FormState => {
  const question = questionOf(state);
  const choice = choiceOf(state);
  if (question === undefined || choice === undefined) return state;

  if (state.row !== ownRowOf(question)) {
    return moveTab(withDraft(state, picking(choice, state.row)), 1);
  }

  return choice.own.trim() === "" ? state : moveTab(withDraft(state, picking(choice, "own")), 1);
};

export const setOwn = (state: FormState, own: string): FormState => {
  const choice = choiceOf(state);

  return choice === undefined ? state : withDraft(state, { ...choice, own });
};

export const setText = (state: FormState, text: string): FormState =>
  state.drafts.at(state.tab)?.kind === "text" ? withDraft(state, { kind: "text", text }) : state;

export const setNotes = (state: FormState, notes: string): FormState => ({ ...state, notes });

/** Picks the option under the cursor and opens its note, with what it held. */
export const startNote = (state: FormState): FormState => {
  const choice = choiceOf(state);
  if (choice === undefined || !isOnOption(state)) return state;

  const picked = picking(choice, state.row);

  return { ...withDraft(state, picked), noting: picked.note };
};

export const setNote = (state: FormState, text: string): FormState =>
  state.noting === undefined ? state : { ...state, noting: text };

export const saveNote = (state: FormState): FormState => {
  const choice = choiceOf(state);
  if (choice === undefined || state.noting === undefined) return state;

  return { ...withDraft(state, { ...choice, note: state.noting.trim() }), noting: undefined };
};

/** Closes the note being written, leaving the note it held before. */
export const dropNote = (state: FormState): FormState => ({ ...state, noting: undefined });

const SKIPPED: Answer = { kind: "skipped" };

/** The draft as an answer; an empty one, or no pick, is skipped. */
const answerOf = (question: Question, draft: Draft): Answer => {
  if (draft.kind === "text") {
    const text = draft.text.trim();

    return text === "" ? SKIPPED : { kind: "written", text };
  }

  if (draft.picked === "own") {
    const text = draft.own.trim();

    return text === "" ? SKIPPED : { kind: "own", text };
  }

  const option = draft.picked === undefined ? undefined : optionsOf(question)[draft.picked];

  return option === undefined
    ? SKIPPED
    : { kind: "picked", option: option.label, note: draft.note };
};

/** What the form sends. */
export const answersOf = (state: FormState): Answers => ({
  answers: state.form.questions.map((question, index) =>
    answerOf(question, state.drafts[index] ?? draftOf(question)),
  ),
  notes: state.notes.trim(),
});
