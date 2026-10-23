/**
 * Questions put to the user inside a tool call: the call logs what it asks and waits for the
 * answer, which comes back as an input. `ask_question` is one kind; other plugins define their
 * own.
 */
import { Context, Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import {
  defineEvent,
  EventInvalid,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "@shanepadgett/liminal-session/contract";

/** A question put to the user; the model never sees it. `callId` is the tool call that asks. */
export const Asked = defineEvent(
  "questions/asked",
  Schema.Struct({
    id: Schema.String,
    callId: Schema.String,
    kind: Schema.String,
    data: Schema.Json,
  }),
);

/** The user's answer to the ask `id`; an input, which the model reads in the call's result. */
export const Answered = defineEvent(
  "questions/answered",
  Schema.Struct({ id: Schema.String, answer: Schema.Json }),
);

/** `/qna`: the user asks the model to ask its open questions; `text` is what they added. */
export const Requested = defineEvent("questions/requested", Schema.Struct({ text: Schema.String }));

/** Who asks: the session and the tool call that waits for the answer. */
export interface Asker {
  readonly session: SessionId;
  readonly callId: string;
}

/** The answer did not decode with its kind's schema. */
export class AnswerInvalid extends Schema.TaggedError<
  AnswerInvalid,
  { readonly brand: unique symbol }
>()("AnswerInvalid", { message: Schema.String }) {}

type LogError = SessionNotFound | SessionStoreFailed | EventInvalid;

export class Questions extends Context.Service<
  Questions,
  {
    /** Logs the ask and waits for its answer; a cancelled turn interrupts the wait. */
    readonly ask: (
      asker: Asker,
      kind: string,
      data: Schema.Json,
    ) => Effect.Effect<Schema.Json, LogError>;
  }
>()("questions/Questions") {}

/** A kind of question: what it asks and how it is answered, both as JSON. */
export interface QuestionKind<Data, Answer> {
  readonly kind: string;
  readonly data: Schema.Codec<Data, Schema.Json>;
  readonly answer: Schema.Codec<Answer, Schema.Json>;
  /** Asks through `Questions` and decodes the answer. */
  readonly ask: (
    asker: Asker,
    data: Data,
  ) => Effect.Effect<Answer, LogError | AnswerInvalid, Questions>;
}

export const defineQuestion = <Data, Answer>(
  kind: string,
  data: Schema.Codec<Data, Schema.Json>,
  answer: Schema.Codec<Answer, Schema.Json>,
): QuestionKind<Data, Answer> => {
  const encode = Schema.encodeEffect(data);
  const decode = Schema.decodeUnknownEffect(answer);

  const ask = Effect.fn("Questions.ask")(function* (asker: Asker, value: Data) {
    const questions = yield* Questions;
    const encoded = yield* Effect.orDie(encode(value));
    const answered = yield* questions.ask(asker, kind, encoded);

    return yield* decode(answered).pipe(
      Effect.mapError((error) => new AnswerInvalid({ message: error.message })),
    );
  });

  return { kind, data, answer, ask };
};

const SendError = Schema.Union([SessionNotFound, SessionStoreFailed, EventInvalid]);

export class QuestionsRpc extends RpcGroup.make(
  /** Sends `/qna`'s request, with `text` after it, which offers `ask_question` for the turn. */
  Rpc.make("questions/qna", {
    payload: { session: SessionId, text: Schema.String },
    error: SendError,
  }),
  /** Sends the user's answer to the ask `id`. */
  Rpc.make("questions/answer", {
    payload: { session: SessionId, id: Schema.String, answer: Schema.Json },
    error: SendError,
  }),
) {}

/** `ask_question`'s name; the tool is deferred, offered only while `/qna`'s request is in the turn. */
export const askQuestionName = "ask_question";

const Filled = Schema.String.check(Schema.isMinLength(1));

export const AnswerOption = Schema.Struct({
  label: Filled,
  description: Schema.optionalKey(Schema.String),
});

export type AnswerOption = typeof AnswerOption.Type;

/** The answer the model suggests, and why. */
export const Recommendation = Schema.Struct({ answer: Filled, reason: Filled });

export type Recommendation = typeof Recommendation.Type;

const asked = { id: Filled, prompt: Filled, recommendation: Schema.optionalKey(Recommendation) };

export const Question = Schema.Union([
  /** The user picks one of `options`, or writes their own. */
  Schema.Struct({
    kind: Schema.Literal("select"),
    ...asked,
    options: Schema.Array(AnswerOption).check(Schema.isMinLength(2)),
  }),
  /** The user answers Yes or No. */
  Schema.Struct({ kind: Schema.Literal("confirm"), ...asked }),
  /** The user writes an answer. */
  Schema.Struct({ kind: Schema.Literal("input"), ...asked }),
]);

export type Question = typeof Question.Type;

export const Form = Schema.Struct({
  title: Filled,
  questions: Schema.Array(Question).check(Schema.isMinLength(1)),
});

export type Form = typeof Form.Type;

/** How the user answered one question; `note` is theirs on the option they picked, or empty. */
export const Answer = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("picked"), option: Schema.String, note: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("own"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("written"), text: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("skipped") }),
]);

export type Answer = typeof Answer.Type;

/** One answer per question, in order, and the additional notes, or empty. */
export const Answers = Schema.Struct({ answers: Schema.Array(Answer), notes: Schema.String });

export type Answers = typeof Answers.Type;

export const formQuestion = defineQuestion(
  "questions/form",
  Schema.toCodecJson(Form),
  Schema.toCodecJson(Answers),
);

const YES_NO: ReadonlyArray<AnswerOption> = [{ label: "Yes" }, { label: "No" }];

/** The options a question offers: its own, Yes and No, or none for a written answer. */
export const optionsOf = (question: Question): ReadonlyArray<AnswerOption> => {
  if (question.kind === "select") return question.options;

  return question.kind === "confirm" ? YES_NO : [];
};

/** The answer in words; none for a skipped question. */
export const answerTextOf = (answer: Answer): string | undefined => {
  if (answer.kind === "skipped") return undefined;

  return answer.kind === "picked" ? answer.option : answer.text;
};

/** The note on the answer, or empty. */
export const noteOf = (answer: Answer) => (answer.kind === "picked" ? answer.note : "");

export const isSuggested = (question: Question, answer: Answer) => {
  const text = answerTextOf(answer);

  return text !== undefined && text === question.recommendation?.answer;
};
