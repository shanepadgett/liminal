/**
 * `ask_question`, declared but not offered until `/qna` offers it: checks the form and answers that
 * it is in front of the user; questions' before-call hook then ends the turn with it.
 */

import { Effect, Schema } from "effect";

import { defineTool, ToolFailed } from "@liminal/sdk";

import { askQuestionTool, Form, optionsOf, type Question } from "../contract.ts";

const DESCRIPTION = [
  "Puts a form of questions to the user. Use it only after the user asks with [qna], to ask the questions you still need answered, and only when a missing preference or constraint would change your next step.",
  "",
  "The form has a short title naming what the questions settle. Each question has an id and a prompt, and one kind:",
  "- select: the user picks one of 2 or more options, or writes their own answer. Give each option a short label and, when it helps, a description.",
  "- confirm: the user answers Yes or No.",
  "- input: the user writes an answer.",
  "",
  "A question may carry a recommendation: the answer you suggest and the reason for it. For select and confirm, the answer is the label of one option (Yes or No for confirm); for input, it is the text you suggest.",
  "",
  "A valid call ends your turn. The user's answers arrive as their next message, so write nothing after the call.",
].join("\n");

/** What the model reads once the form is up. */
export const SEEN_BY_USER =
  "The questions are in front of the user. Stop here; their answers arrive as their next message.";

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
export const formProblem = (form: Form) => {
  const repeated = repeatedId(form.questions);
  if (repeated !== undefined) return `Two questions have the id "${repeated}". Give each its own.`;

  return form.questions.map(recommendationProblem).find((problem) => problem !== undefined);
};

const encodeForm = Schema.encodeSync(Form);

export const askQuestion = defineTool({
  name: askQuestionTool,
  description: DESCRIPTION,
  parameters: Form,
  offer: "plugin",
  hints: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  runAlongside: false,
  safeToRerun: true,
  run: (form) => {
    const problem = formProblem(form);

    return problem === undefined
      ? Effect.succeed({ result: SEEN_BY_USER, details: encodeForm(form) })
      : Effect.fail(new ToolFailed({ message: problem }));
  },
});
