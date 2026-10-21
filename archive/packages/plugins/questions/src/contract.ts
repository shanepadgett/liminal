/**
 * Questions: `/qna` offers the model `ask_question`, whose call ends the turn with a form of
 * questions; the user's answers, or their cancel, come back as the next message and withdraw it.
 */

import { Match, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SendError } from "@liminal/inbox/contract";
import { defineEntry, InvalidEntry, SessionId, SessionNotFound, StoreError } from "@liminal/sdk";

/** The tool's name. */
export const askQuestionTool = "ask_question";

const Filled = Schema.String.check(Schema.isMinLength(1));

export const AnswerOption = Schema.Struct({
  label: Filled,
  description: Schema.optionalKey(Schema.String),
});

export type AnswerOption = typeof AnswerOption.Type;

/** The answer the model suggests and why. */
export const Recommendation = Schema.Struct({ answer: Filled, reason: Filled });

export type Recommendation = typeof Recommendation.Type;

const asked = { id: Filled, prompt: Filled, recommendation: Schema.optionalKey(Recommendation) };

/** The user picks one of `options`, or writes their own. */
const SelectQuestion = Schema.Struct({
  kind: Schema.Literal("select"),
  ...asked,
  options: Schema.Array(AnswerOption).check(Schema.isMinLength(2)),
});

/** The user answers Yes or No. */
const ConfirmQuestion = Schema.Struct({ kind: Schema.Literal("confirm"), ...asked });

/** The user writes an answer. */
const InputQuestion = Schema.Struct({ kind: Schema.Literal("input"), ...asked });

export const Question = Schema.Union([SelectQuestion, ConfirmQuestion, InputQuestion]);

export type Question = typeof Question.Type;

/** What `ask_question` takes and its form entry holds. */
export const Form = Schema.Struct({
  title: Filled,
  questions: Schema.Array(Question).check(Schema.isMinLength(1)),
});

export type Form = typeof Form.Type;

/** A note the user left on one of a question's options, picked or not. */
export const Note = Schema.Struct({ option: Schema.String, text: Schema.String });

export type Note = typeof Note.Type;

/** How the user answered: picked an option, wrote their own in place of them, wrote one, or skipped. */
export const Answer = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("picked"),
    option: Schema.String,
    notes: Schema.Array(Note),
  }),
  Schema.Struct({ kind: Schema.Literal("own"), text: Schema.String, notes: Schema.Array(Note) }),
  Schema.Struct({ kind: Schema.Literal("written"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("skipped") }),
]);

export type Answer = typeof Answer.Type;

export const Answered = Schema.Struct({ question: Question, answer: Answer });

export type Answered = typeof Answered.Type;

/** The user's answers to a form; `context` is what else they wanted the model to know, or empty. */
export const Answers = Schema.Struct({
  title: Schema.String,
  answered: Schema.Array(Answered),
  context: Schema.String,
});

export type Answers = typeof Answers.Type;

/** A form `ask_question` put to the user, ending the turn. */
export const FormEntry = defineEntry({
  kind: "questions/form",
  data: Form,
  model: false,
  user: "shown",
});

/** The user's answers, sent as their next message; the model reads them and the tool's withdrawal. */
export const AnswersEntry = defineEntry({
  kind: "questions/answers",
  data: Answers,
  model: true,
  user: "shown",
});

/** The user cancelled the form; the model reads that and the tool's withdrawal. */
export const CancelledEntry = defineEntry({
  kind: "questions/cancelled",
  data: Schema.Struct({ title: Schema.String }),
  model: true,
  user: "hidden",
});

/** No form waits on the user. */
export const NoForm = Schema.TaggedStruct("NoForm", {});

/** The form saved at `seq` waits on the user. */
export const Asked = Schema.TaggedStruct("Asked", { seq: Schema.Int, form: Form });

export const Pending = Schema.Union([NoForm, Asked]);

export type Pending = typeof Pending.Type;

/** The form an answer or cancel names no longer waits, as after the user sent something else. */
export class FormGone extends Schema.TaggedError<FormGone, { readonly brand: unique symbol }>()(
  "FormGone",
  { seq: Schema.Int },
) {}

const CONFIRM_OPTIONS: ReadonlyArray<AnswerOption> = [{ label: "Yes" }, { label: "No" }];

/** The options a question offers: its own, Yes and No, or none for a written answer. */
export const optionsOf = (question: Question): ReadonlyArray<AnswerOption> =>
  Match.value(question).pipe(
    Match.discriminatorsExhaustive("kind")({
      select: (select) => select.options,
      confirm: () => CONFIRM_OPTIONS,
      input: () => [],
    }),
  );

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

export const notesOf = (answer: Answer): ReadonlyArray<Note> =>
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

const answerLines = ({ question, answer }: Answered, index: number) => [
  `${index + 1}. ${question.prompt} ${answerTextOf(answer)}${answer.kind === "own" ? " (own answer)" : ""}`,
  ...notesOf(answer).map((note) => `   Note on ${note.option}: ${note.text}`),
];

/** The answers as the model reads them. */
export const answersText = (answers: Answers) =>
  [
    `Answers to ${answers.title}:`,
    ...answers.answered.flatMap(answerLines),
    ...(answers.context === "" ? [] : [`Additional context: ${answers.context}`]),
  ].join("\n");

const AnswerError = Schema.Union([FormGone, SendError]);

const CancelError = Schema.Union([FormGone, SessionNotFound, InvalidEntry, StoreError]);

/** Questions' commands for frontends. */
export class QuestionsRpcs extends RpcGroup.make(
  /** Sends `/qna`'s request, with `context` after it, offering `ask_question`. */
  Rpc.make("questions/ask", {
    payload: { session: SessionId, context: Schema.String },
    error: SendError,
  }),
  /** Whether a form waits on the user, then each change. */
  Rpc.make("questions/pending", {
    payload: { session: SessionId },
    success: Pending,
    stream: true,
  }),
  /** Sends the answers to the form saved at `seq`. */
  Rpc.make("questions/answer", {
    payload: { session: SessionId, seq: Schema.Int, answers: Answers },
    error: AnswerError,
  }),
  /** Cancels the form saved at `seq`, sending nothing but the cancel. */
  Rpc.make("questions/cancel", {
    payload: { session: SessionId, seq: Schema.Int },
    error: CancelError,
  }),
) {}
