/**
 * Decisions over fake registered models: the order models are tried in, the preference, the
 * deadline, the input limit, and answers that fail the checks.
 */

import { expect } from "bun:test";

import { Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";

import {
  type Answer,
  BoolAnswer,
  BoolQuestion,
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionFailed,
  type Question,
} from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import decisions from "../plugin.ts";
import { Decided, type DecisionFamily, DecisionModels, Decisions } from "../src/contract.ts";

const stack = serverOf(decisions).pipe(Layer.provideMerge(testBaseServices));

/** The answering model's id, or the skip reason and message. */
const outcome = (decided: Decided) =>
  Decided.$match(decided, {
    Answered: ({ model }) => model,
    Skipped: ({ reason, message }) => `${reason}: ${message}`,
  });

const questions: Readonly<Record<string, Question>> = {
  risk: ChoiceQuestion.make({
    instructions: "How risky?",
    criteria: { safe: "Reads only", risky: "Changes files" },
  }),
  network: BoolQuestion.make({
    instructions: "Network?",
    criteria: { true: "Connects out", false: "Stays local" },
  }),
};

const good: Readonly<Record<string, Answer>> = {
  risk: ChoiceAnswer.make({
    choice: "safe",
    probabilities: { safe: 0.9, risky: 0.1 },
    confidence: 0.9,
  }),
  network: BoolAnswer.make({ probability: 0.1 }),
};

type Reply = Effect.Effect<Readonly<Record<string, Answer>>, DecisionFailed>;

/** Registers a fake model in the test's scope. */
const register = (
  id: string,
  family: DecisionFamily,
  available: boolean,
  reply: Reply = Effect.succeed(good),
) =>
  Effect.flatMap(DecisionModels, (models) =>
    models.register({ id, family, available: Effect.succeed(available), classify: () => reply }),
  );

effectTest(
  "Jev is asked before Luna, models without a login are passed over, and a preference keeps one family",
  Effect.gen(function* () {
    yield* register("openai/luna", "luna", true);
    yield* register("openrouter/jev", "jev", false);
    yield* register("other/jev", "jev", true);

    const service = yield* Decisions;

    expect(outcome(yield* service.classify({}, questions, "auto"))).toBe("other/jev");

    expect(outcome(yield* service.classify({}, questions, "luna"))).toBe("openai/luna");
  }),
  stack,
);

effectTest(
  "no available model, or input over the limit, is skipped as unavailable",
  Effect.gen(function* () {
    const service = yield* Decisions;

    expect(outcome(yield* service.classify({}, questions, "auto"))).toStartWith("unavailable:");

    yield* register("openrouter/jev", "jev", true);

    expect(
      outcome(yield* service.classify({ big: "x".repeat(48_001) }, questions, "auto")),
    ).toStartWith("unavailable:");
  }),
  stack,
);

effectTest(
  "a model slower than three seconds is skipped as a timeout",
  Effect.gen(function* () {
    yield* register("openrouter/jev", "jev", true, Effect.never);

    const fiber = yield* Effect.forkChild((yield* Decisions).classify({}, questions, "auto"));
    yield* TestClock.adjust("3 seconds");

    expect(outcome(yield* Fiber.join(fiber))).toStartWith("timeout:");
  }),
  stack,
);

effectTest(
  "a failed call, a missing answer and probabilities that do not sum to one are skipped as errors",
  Effect.gen(function* () {
    const service = yield* Decisions;

    const skipped = (reply: Reply) =>
      Effect.scoped(
        Effect.andThen(
          register("openrouter/jev", "jev", true, reply),
          service.classify({}, questions, "jev"),
        ),
      );

    expect(outcome(yield* skipped(Effect.fail(new DecisionFailed({ message: "down" }))))).toBe(
      "error: down",
    );

    const missing = yield* skipped(
      Effect.succeed({ network: BoolAnswer.make({ probability: 0.1 }) }),
    );

    expect(outcome(missing)).toStartWith("error:");

    const uneven = ChoiceAnswer.make({
      choice: "safe",
      probabilities: { safe: 0.9, risky: 0.5 },
      confidence: 0.9,
    });

    expect(outcome(yield* skipped(Effect.succeed({ ...good, risk: uneven })))).toStartWith(
      "error:",
    );
  }),
  stack,
);
