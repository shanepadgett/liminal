/** `ask_question`'s answers as the model reads them. */
import {
  type Answer,
  type Answers,
  answerTextOf,
  type Form,
  isSuggested,
  noteOf,
  type Question,
} from "./contract.ts";

const answerLines = (question: Question, answer: Answer, index: number) => {
  const marks = [
    ...(answer.kind === "own" ? [" (own answer)"] : []),
    ...(isSuggested(question, answer) ? [" (suggested)"] : []),
  ].join("");

  const note = noteOf(answer);

  return [
    `${index + 1}. ${question.prompt}`,
    `   ${answerTextOf(answer) ?? "skipped"}${marks}`,
    ...(note === "" ? [] : [`   Note: ${note}`]),
  ];
};

/** The answers as the model reads them. */
export const answersText = (form: Form, { answers, notes }: Answers) =>
  [
    `Answers to ${form.title}:`,
    ...form.questions.flatMap((question, index) =>
      answerLines(question, answers[index] ?? { kind: "skipped" }, index),
    ),
    ...(notes.trim() === "" ? [] : [`Additional notes: ${notes.trim()}`]),
  ].join("\n");
