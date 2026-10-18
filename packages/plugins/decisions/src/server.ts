/** Decisions' server: picks a decision model, bounds the call, and checks every answer. */

import { Duration, Effect, Layer, Match, Number, Option, Predicate } from "effect";

import { type Answer, type DecisionState, KeyedRegistry, type Question } from "@liminal/sdk";

import {
  Decided,
  type DecisionFamily,
  type DecisionModel,
  DecisionModels,
  type DecisionPreference,
  Decisions,
} from "./contract.ts";

/** The most input, state and questions as JSON, sent to a decision model. */
const maxBytes = 48_000;

/** How long a decision model may take before the call is skipped. */
const deadline = Duration.seconds(3);

const families: ReadonlyArray<DecisionFamily> = ["jev", "luna"];

const isUnit = (value: number) => value >= 0 && value <= 1;

/** A choice among the criteria, every probability in range and together close to 1. */
const validChoice = (criteria: Readonly<Record<string, string>>, answer: Answer) => {
  if (!Predicate.isTagged(answer, "Choice")) return false;

  const probabilities = Object.values(answer.probabilities);

  return (
    Object.hasOwn(criteria, answer.choice)
    && isUnit(answer.confidence)
    && probabilities.every(isUnit)
    && Math.abs(Number.sumAll(probabilities) - 1) <= 0.02
  );
};

const validAnswer = (question: Question, answer: Answer | undefined) =>
  answer !== undefined
  && Match.valueTags(question, {
    Choice: ({ criteria }) => validChoice(criteria, answer),
    Score: () =>
      Predicate.isTagged(answer, "Score") && isUnit(answer.score) && isUnit(answer.confidence),
    Bool: () => Predicate.isTagged(answer, "Bool") && isUnit(answer.probability),
  });

/** The id of the first question without a valid answer. */
const firstInvalid = (
  questions: Readonly<Record<string, Question>>,
  answers: Readonly<Record<string, Answer>>,
) => Object.entries(questions).find(([id, question]) => !validAnswer(question, answers[id]))?.[0];

/** The registered models in the order they are tried: Jev first, then by id within a family. */
const candidatesOf = (models: ReadonlyArray<DecisionModel>, prefer: DecisionPreference) =>
  families.flatMap((family) =>
    prefer === "auto" || family === prefer ? models.filter((model) => model.family === family) : [],
  );

/** Asks `model`, within the deadline, and checks its answers. */
const ask = (
  model: DecisionModel,
  state: DecisionState,
  questions: Readonly<Record<string, Question>>,
) =>
  model.classify(state, questions).pipe(
    Effect.map((answers) => {
      const invalid = firstInvalid(questions, answers);

      return invalid === undefined
        ? Decided.Answered({ model: model.id, answers })
        : Decided.Skipped({
            reason: "error",
            message: `${model.id} gave an answer out of range for ${invalid}`,
          });
    }),
    Effect.timeoutOrElse({
      duration: deadline,
      orElse: () =>
        Effect.succeed(
          Decided.Skipped({
            reason: "timeout",
            message: `${model.id} took longer than ${Duration.format(deadline)}`,
          }),
        ),
    }),
    Effect.catchTag("DecisionFailed", (error) =>
      Effect.succeed(Decided.Skipped({ reason: "error", message: error.message })),
    ),
  );

const make = Effect.gen(function* () {
  const models = yield* DecisionModels;

  const classify = Effect.fn("Decisions.classify")(function* (
    state: DecisionState,
    questions: Readonly<Record<string, Question>>,
    prefer: DecisionPreference,
  ) {
    const bytes = new TextEncoder().encode(JSON.stringify({ state, questions })).length;

    if (bytes > maxBytes)
      return Decided.Skipped({
        reason: "unavailable",
        message: `the input is ${bytes} bytes, over the ${maxBytes} byte limit`,
      });

    const model = yield* Effect.findFirst(
      candidatesOf(yield* models.list, prefer),
      (candidate) => candidate.available,
    );

    if (Option.isNone(model))
      return Decided.Skipped({ reason: "unavailable", message: "no decision model is signed in" });

    return yield* ask(model.value, state, questions);
  });

  return Decisions.of({ classify });
});

export const layer = Layer.effect(Decisions, make).pipe(
  Layer.provideMerge(KeyedRegistry.layer(DecisionModels, (model) => model.id)),
);
