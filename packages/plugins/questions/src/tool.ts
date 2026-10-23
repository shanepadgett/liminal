/**
 * `ask_question`: checks the form, puts it to the user and returns their answers. Deferred: offered
 * only during a turn that took `/qna`'s request.
 */
import { Effect } from "effect";

import { defineTool, noAccess, ToolFailed } from "@shanepadgett/liminal-tools/contract";

import {
  askQuestionName,
  Form,
  formQuestion,
  optionsOf,
  type Question,
  Questions,
} from "./contract.ts";
import { answersText } from "./form.ts";

const DESCRIPTION = [
  "Puts a form of questions to the user and returns their answers. Use it only after the user asks with [qna], to ask the questions you still need answered, and only when a missing preference or constraint would change your next step.",
  "",
  "The form has a short title naming what the questions settle. Each question has an id and a prompt, and one kind:",
  "- select: the user picks one of 2 or more options, or writes their own answer. Give each option a short label and, when it helps, a description.",
  "- confirm: the user answers Yes or No.",
  "- input: the user writes an answer.",
  "",
  "A question may carry a recommendation: the answer you suggest and the reason for it. For select and confirm, the answer is the label of one option (Yes or No for confirm); for input, it is the text you suggest.",
  "",
  "The user may skip questions, leave a note on an answer, and add notes of their own.",
].join("\n");

/** The first id two questions share, if any. */
const repeatedId = (questions: ReadonlyArray<Question>) => {
  const seen = new Set<string>();

  return questions.find(({ id }) => seen.size === seen.add(id).size)?.id;
};

/** What is wrong with a question's recommendation, when it names no option. */
const recommendationProblem = (question: Question) => {
  const labels = optionsOf(question).map(({ label }) => label);
  const answer = question.recommendation?.answer;

  return answer === undefined || labels.length === 0 || labels.includes(answer)
    ? undefined
    : `The recommendation of "${question.id}" is "${answer}", which is not one of its options: ${labels.join(", ")}.`;
};

/** Why the form cannot go to the user, if it cannot. */
const formProblem = (form: Form) => {
  const repeated = repeatedId(form.questions);
  if (repeated !== undefined) return `Two questions have the id "${repeated}". Give each its own.`;

  return form.questions.map(recommendationProblem).find((problem) => problem !== undefined);
};

export const makeAskQuestion = (questions: Questions["Service"]) =>
  defineTool({
    name: askQuestionName,
    description: DESCRIPTION,
    input: Form,
    deferred: true,
    access: () => noAccess,
    run: Effect.fn("ask_question")(function* (form, { session, callId }) {
      const problem = formProblem(form);
      if (problem !== undefined) return yield* new ToolFailed({ message: problem });

      const answers = yield* formQuestion.ask({ session, callId }, form).pipe(
        Effect.provideService(Questions, questions),
        Effect.mapError((error) => new ToolFailed({ message: error.message })),
      );

      return { content: [{ type: "text", text: answersText(form, answers) }] };
    }),
  });
