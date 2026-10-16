/** How a question and its answer read: in the composer's form, and in the answers the user sent. */

import { Match } from "effect";

import type { Answer, Answered, AnswerOption, Note, Question } from "./script.ts";

const CONFIRM_OPTIONS: readonly AnswerOption[] = [{ label: "Yes" }, { label: "No" }];

/** The options a question offers: its own, Yes and No, or none for a written answer. */
export const optionsOf = (question: Question): readonly AnswerOption[] => {
  if (question.kind === "select") return question.options;

  return question.kind === "confirm" ? CONFIRM_OPTIONS : [];
};

/** The answer in words, or `skipped` for a question the user left open. */
export const answerTextOf = (answer: Answer): string =>
  Match.value(answer).pipe(
    Match.discriminatorsExhaustive("kind")({
      picked: (picked) => picked.option,
      own: (own) => own.text,
      written: (written) => written.text,
      skipped: () => "skipped",
    }),
  );

export const notesOf = (answer: Answer): readonly Note[] =>
  answer.kind === "picked" || answer.kind === "own" ? answer.notes : [];

/**
 * What sets the answer apart, beside it: the user's own in place of the options, or the suggested
 * one.
 */
export const tagsOf = ({ question, answer }: Answered) => {
  const own = answer.kind === "own" ? ["own answer"] : [];

  const isSuggested =
    answer.kind !== "skipped" && question.recommendation?.answer === answerTextOf(answer);

  return [...own, ...(isSuggested ? ["as suggested"] : [])].join(" · ");
};

/** The answer the assistant suggested, when the user chose another. */
export const passedOverOf = ({ question, answer }: Answered) => {
  const suggested = question.recommendation?.answer;

  return suggested === answerTextOf(answer) ? undefined : suggested;
};
