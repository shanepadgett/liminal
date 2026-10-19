/**
 * The form's state while the user answers: one tab per question and one for additional context, the
 * row under the cursor, what each question has so far and the note being written. Questions left
 * open are sent as skipped.
 */

import type { Hint } from "@liminal/sdk/tui";

import {
  type Answer,
  type Answers,
  type Form,
  type Note,
  optionsOf,
  type Question,
} from "../contract.ts";

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

export type Choice = Extract<Draft, { kind: "choice" }>;

/** The note being written on an option. */
export interface Noting {
  readonly option: number;
  readonly text: string;
}

export interface FormState {
  readonly form: Form;
  readonly drafts: ReadonlyArray<Draft>;
  readonly context: string;
  /** A question's index, or the number of questions for additional context. */
  readonly tab: number;
  readonly row: number;
  readonly noting: Noting | undefined;
}

const draftOf = (question: Question): Draft =>
  question.kind === "input"
    ? { kind: "text", text: "" }
    : { kind: "choice", picked: undefined, own: "", notes: {} };

export const formState = (form: Form): FormState => ({
  form,
  drafts: form.questions.map(draftOf),
  context: "",
  tab: 0,
  row: 0,
  noting: undefined,
});

/** Whether the cursor is on a select question's last row, where the user writes their own answer. */
const isOwnRow = (question: Question, row: number) =>
  question.kind === "select" && row === question.options.length;

/** The question on the tab in view; none on the context tab. */
export const questionOf = (state: FormState): Question | undefined =>
  state.form.questions.at(state.tab);

const choiceOf = (state: FormState): Choice | undefined => {
  const draft = state.drafts.at(state.tab);

  return draft?.kind === "choice" ? draft : undefined;
};

/** Whether a field holds the keys: a note, the own answer, a written answer or the context. */
export const isWriting = (state: FormState) => {
  const question = questionOf(state);
  if (question === undefined || state.noting !== undefined) return true;

  return question.kind === "input" || isOwnRow(question, state.row);
};

const withDraft = (state: FormState, draft: Draft): FormState => ({
  ...state,
  drafts: state.drafts.map((each, index) => (index === state.tab ? draft : each)),
});

/** Moves `by` tabs, wrapping, to the new tab's first row. */
export const moveTab = (state: FormState, by: number): FormState => {
  const tabs = state.form.questions.length + 1;

  return { ...state, tab: (state.tab + by + tabs) % tabs, row: 0, noting: undefined };
};

/** Moves `by` rows within a choice tab's options and own row. */
export const moveRow = (state: FormState, by: number): FormState => {
  const question = questionOf(state);

  if (question === undefined || question.kind === "input" || state.noting !== undefined) {
    return state;
  }

  const rows = optionsOf(question).length + (question.kind === "select" ? 1 : 0);

  return { ...state, row: Math.min(Math.max(state.row + by, 0), rows - 1) };
};

/** Picks the option under the cursor, or the own answer once written, then goes to the next tab. */
export const pick = (state: FormState): FormState => {
  const question = questionOf(state);
  const choice = choiceOf(state);
  if (question === undefined || choice === undefined) return state;

  if (isOwnRow(question, state.row)) {
    return choice.own.trim() === ""
      ? state
      : moveTab(withDraft(state, { ...choice, picked: "own" }), 1);
  }

  return moveTab(withDraft(state, { ...choice, picked: state.row }), 1);
};

export const setOwn = (state: FormState, own: string): FormState => {
  const choice = choiceOf(state);

  return choice === undefined ? state : withDraft(state, { ...choice, own });
};

export const setText = (state: FormState, text: string): FormState =>
  state.drafts.at(state.tab)?.kind === "text" ? withDraft(state, { kind: "text", text }) : state;

export const setContext = (state: FormState, context: string): FormState => ({ ...state, context });

/** Opens a note on the option under the cursor, with what it held. */
export const startNote = (state: FormState): FormState => {
  const choice = choiceOf(state);
  if (choice === undefined || isWriting(state)) return state;

  return { ...state, noting: { option: state.row, text: choice.notes[state.row] ?? "" } };
};

export const setNote = (state: FormState, text: string): FormState =>
  state.noting === undefined ? state : { ...state, noting: { ...state.noting, text } };

/** Keeps the note; an empty one removes the option's note. */
export const saveNote = (state: FormState): FormState => {
  const choice = choiceOf(state);
  const noting = state.noting;
  if (choice === undefined || noting === undefined) return state;

  const notes = Object.fromEntries(
    Object.entries(choice.notes).filter(([index]) => Number(index) !== noting.option),
  );

  const text = noting.text.trim();
  const kept = text === "" ? notes : { ...notes, [noting.option]: text };

  return { ...withDraft(state, { ...choice, notes: kept }), noting: undefined };
};

export const dropNote = (state: FormState): FormState => ({ ...state, noting: undefined });

const notesOf = (question: Question, choice: Choice): ReadonlyArray<Note> => {
  const options = optionsOf(question);

  return Object.entries(choice.notes).flatMap(([index, text]) => {
    const option = options[Number(index)];

    return option === undefined ? [] : [{ option: option.label, text }];
  });
};

const SKIPPED: Answer = { kind: "skipped" };

/** The draft as an answer; an empty one, or no pick, is skipped. */
const answerOf = (question: Question, draft: Draft): Answer => {
  if (draft.kind === "text") {
    const text = draft.text.trim();

    return text === "" ? SKIPPED : { kind: "written", text };
  }

  const notes = notesOf(question, draft);

  if (draft.picked === "own") {
    const text = draft.own.trim();

    return text === "" ? SKIPPED : { kind: "own", text, notes };
  }

  const option = draft.picked === undefined ? undefined : optionsOf(question)[draft.picked];

  return option === undefined ? SKIPPED : { kind: "picked", option: option.label, notes };
};

/** What the form sends. */
export const answersOf = (state: FormState): Answers => ({
  title: state.form.title,
  answered: state.form.questions.map((question, index) => ({
    question,
    answer: answerOf(question, state.drafts[index] ?? draftOf(question)),
  })),
  context: state.context.trim(),
});

const NOTING: ReadonlyArray<Hint> = [
  ["enter", "save note"],
  ["esc", "drop note"],
];

/** What enter does on the tab in view. */
const enterHint = (state: FormState): Hint => {
  if (questionOf(state) === undefined) return ["enter", "send answers"];

  return isWriting(state) ? ["enter", "accept"] : ["enter", "pick"];
};

/** What the keys do on the tab in view: ↑↓ wherever rows move, `n` on an option. */
export const hintsOf = (state: FormState): ReadonlyArray<Hint> => {
  if (state.noting !== undefined) return NOTING;

  const question = questionOf(state);
  const hasRows = question !== undefined && question.kind !== "input";
  const onOption = hasRows && !isWriting(state);

  return [
    ...(hasRows ? [["↑↓", "choose"] satisfies Hint] : []),
    enterHint(state),
    ...(onOption ? [["n", "note"] satisfies Hint] : []),
    question === undefined ? ["shift+tab", "back"] : ["tab", "next"],
    ["esc", "cancel"],
  ];
};
