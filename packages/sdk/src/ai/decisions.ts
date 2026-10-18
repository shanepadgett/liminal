/**
 * Decision model wires: System One, which Jev speaks on OpenRouter, and OpenAI's Decisions API,
 * which Luna Decisions speaks on OpenAI and OpenRouter. One POST each, signed with a bearer key,
 * not retried: callers ask decision models on a short deadline.
 */

import { Effect, Match, Predicate, type Redacted, Schema } from "effect";
import { type HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

import {
  type Answer,
  BoolAnswer,
  ChoiceAnswer,
  DecisionFailed,
  type DecisionState,
  type ModelError,
  type Question,
  ScoreAnswer,
} from "../core/index.ts";

/** Where a decision model is served and the key that signs each request, read per call. */
interface DecisionWire {
  readonly url: string;
  readonly key: Effect.Effect<Redacted.Redacted, ModelError>;
  readonly model: string;
}

/** Asks the model every question about the state; each answer is keyed by its question's id. */
type Classify = (
  state: DecisionState,
  questions: Readonly<Record<string, Question>>,
) => Effect.Effect<Readonly<Record<string, Answer>>, DecisionFailed>;

const send = (http: HttpClient.HttpClient, wire: DecisionWire, body: Schema.Json) =>
  Effect.flatMap(wire.key, (key) =>
    http.execute(
      HttpClientRequest.post(wire.url).pipe(
        HttpClientRequest.bearerToken(key),
        HttpClientRequest.bodyJsonUnsafe(body),
      ),
    ),
  ).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));

const failedAs =
  (label: string) =>
  (error: { readonly message: string }): DecisionFailed =>
    new DecisionFailed({ message: `${label} failed: ${error.message}` });

/** Whether `answer` is of `question`'s kind. */
const sameKind = (question: Question, answer: Answer) =>
  Match.valueTags(question, {
    Choice: () => Predicate.isTagged(answer, "Choice"),
    Score: () => Predicate.isTagged(answer, "Score"),
    Bool: () => Predicate.isTagged(answer, "Bool"),
  });

/** Each question's answer from `answers`, which must be there and of the question's kind. */
const matched = (
  label: string,
  questions: Readonly<Record<string, Question>>,
  answers: ReadonlyMap<string, Answer>,
) =>
  Effect.map(
    Effect.forEach(Object.entries(questions), ([id, question]) => {
      const answer = answers.get(id);

      return answer !== undefined && sameKind(question, answer)
        ? Effect.succeed<readonly [string, Answer]>([id, answer])
        : Effect.fail(new DecisionFailed({ message: `${label} gave no fitting answer for ${id}` }));
    }),
    (entries): Readonly<Record<string, Answer>> => Object.fromEntries(entries),
  );

const Probabilities = Schema.Record(Schema.String, Schema.Finite);

const SystemOneAnswer = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("choice"),
    choice: Schema.String,
    probabilities: Probabilities,
    confidence: Schema.Finite,
  }),
  Schema.Struct({ type: Schema.Literal("score"), score: Schema.Finite, confidence: Schema.Finite }),
  Schema.Struct({ type: Schema.Literal("noul"), noul: Schema.Finite }),
]);

const SystemOneReply = Schema.Struct({ answers: Schema.Record(Schema.String, SystemOneAnswer) });

/** A question as System One takes it; `noul` is its name for yes or no. */
const systemOneQuestion = (question: Question): Schema.Json =>
  Match.valueTags(question, {
    Choice: ({ instructions, criteria }) => ({ type: "choice", instructions, criteria }),
    Score: ({ instructions, criteria }) => ({ type: "score", instructions, criteria }),
    Bool: ({ instructions, criteria }) => ({ type: "noul", instructions, criteria }),
  });

const systemOneAnswer = (answer: typeof SystemOneAnswer.Type): Answer => {
  if (answer.type === "choice")
    return ChoiceAnswer.make({
      choice: answer.choice,
      probabilities: answer.probabilities,
      confidence: answer.confidence,
    });

  if (answer.type === "score")
    return ScoreAnswer.make({ score: answer.score, confidence: answer.confidence });

  return BoolAnswer.make({ probability: answer.noul });
};

/** The System One wire: questions and answers keyed by id, the state as JSON. */
export const systemOne =
  (http: HttpClient.HttpClient, wire: DecisionWire): Classify =>
  (state, questions) =>
    send(http, wire, {
      model: wire.model,
      state,
      questions: Object.fromEntries(
        Object.entries(questions).map(([id, question]) => [id, systemOneQuestion(question)]),
      ),
    }).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(SystemOneReply)),
      Effect.mapError(failedAs("System One")),
      Effect.flatMap(({ answers }) =>
        matched(
          "System One",
          questions,
          new Map(Object.entries(answers).map(([id, answer]) => [id, systemOneAnswer(answer)])),
        ),
      ),
    );

const DecisionsAnswer = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("choice"),
    name: Schema.String,
    choice: Schema.String,
    probabilities: Schema.Array(
      Schema.Struct({ value: Schema.String, probability: Schema.Finite }),
    ),
    confidence: Schema.Finite,
  }),
  Schema.Struct({
    type: Schema.Literal("score"),
    name: Schema.String,
    score: Schema.Finite,
    confidence: Schema.Finite,
  }),
  Schema.Struct({
    type: Schema.Literal("predicate"),
    name: Schema.String,
    probability: Schema.Finite,
  }),
  Schema.Struct({ type: Schema.Literal("refusal") }),
]);

const DecisionsReply = Schema.Struct({ answers: Schema.Array(DecisionsAnswer) });

type DecisionsAnswer = typeof DecisionsAnswer.Type;

/** A question as the Decisions API takes it; predicates carry their meanings in the instructions. */
const decisionsQuestion = (name: string, question: Question): Schema.Json =>
  Match.valueTags(question, {
    Choice: ({ instructions, criteria }) => ({
      type: "choice",
      name,
      instructions,
      choices: Object.entries(criteria).map(([value, description]) => ({ value, description })),
    }),
    Score: ({ instructions, criteria }) => ({
      type: "score",
      name,
      instructions,
      levels: criteria.map((label) => ({ label })),
    }),
    Bool: ({ instructions, criteria }) => ({
      type: "predicate",
      name,
      instructions: `${instructions}\n\nTrue means: ${criteria.true}\nFalse means: ${criteria.false}`,
    }),
  });

const decisionsAnswer = (
  answer: Exclude<DecisionsAnswer, { readonly type: "refusal" }>,
): Answer => {
  if (answer.type === "choice")
    return ChoiceAnswer.make({
      choice: answer.choice,
      probabilities: Object.fromEntries(
        answer.probabilities.map(({ value, probability }) => [value, probability]),
      ),
      confidence: answer.confidence,
    });

  if (answer.type === "score")
    return ScoreAnswer.make({ score: answer.score, confidence: answer.confidence });

  return BoolAnswer.make({ probability: answer.probability });
};

/** The answers by question name; a refusal fails the whole call. */
const decisionsAnswers = (answers: ReadonlyArray<DecisionsAnswer>) =>
  Effect.forEach(answers, (answer) =>
    answer.type === "refusal"
      ? Effect.fail(new DecisionFailed({ message: "OpenAI Decisions refused to answer" }))
      : Effect.succeed<readonly [string, Answer]>([answer.name, decisionsAnswer(answer)]),
  ).pipe(Effect.map((entries) => new Map(entries)));

/** OpenAI's Decisions wire: questions as a named list, the state as JSON text. */
export const openAiDecisions =
  (http: HttpClient.HttpClient, wire: DecisionWire): Classify =>
  (state, questions) =>
    send(http, wire, {
      model: wire.model,
      input: JSON.stringify(state),
      questions: Object.entries(questions).map(([name, question]) =>
        decisionsQuestion(name, question),
      ),
    }).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(DecisionsReply)),
      Effect.mapError(failedAs("OpenAI Decisions")),
      Effect.flatMap(({ answers }) => decisionsAnswers(answers)),
      Effect.flatMap((answers) => matched("OpenAI Decisions", questions, answers)),
    );
