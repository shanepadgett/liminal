/**
 * The decision model wires over a stub HTTP client: what each sends for every kind of question, how
 * each answer comes back, and what fails the call.
 */

import { expect } from "bun:test";

import { Effect, Layer, Redacted, Ref, Schema } from "effect";

import { openAiDecisions, systemOne } from "../src/ai/decisions.ts";
import {
  BoolAnswer,
  BoolQuestion,
  ChoiceAnswer,
  ChoiceQuestion,
  DecisionFailed,
  type Question,
  ScoreAnswer,
  ScoreQuestion,
} from "../src/core/index.ts";
import { effectTest } from "../src/testing/effect-test.ts";
import { type Sent, stubHttp } from "../src/testing/http.ts";

const questions: Readonly<Record<string, Question>> = {
  risk: ChoiceQuestion.make({
    instructions: "How risky is the command?",
    criteria: { safe: "Reads only", risky: "Changes files" },
  }),
  scope: ScoreQuestion.make({ instructions: "How much does it touch?", criteria: ["one", "many"] }),
  network: BoolQuestion.make({
    instructions: "Does it reach the network?",
    criteria: { true: "It connects out", false: "It stays local" },
  }),
};

const state = { command: "ls" };

const json = (body: Schema.Json, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const wire = (url: string) => ({
  url,
  key: Effect.succeed(Redacted.make("key-1")),
  model: "model-1",
});

const expected = {
  risk: ChoiceAnswer.make({
    choice: "safe",
    probabilities: { safe: 0.9, risky: 0.1 },
    confidence: 0.8,
  }),
  scope: ScoreAnswer.make({ score: 0.2, confidence: 0.7 }),
  network: BoolAnswer.make({ probability: 0.05 }),
};

effectTest(
  "System One sends questions by id and reads noul answers as yes or no",
  Effect.gen(function* () {
    const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);

    const http = stubHttp(sent, () =>
      json({
        answers: {
          risk: {
            type: "choice",
            choice: "safe",
            probabilities: { safe: 0.9, risky: 0.1 },
            confidence: 0.8,
          },
          scope: { type: "score", score: 0.2, confidence: 0.7 },
          network: { type: "noul", noul: 0.05 },
        },
      }),
    );

    const answers = yield* systemOne(http, wire("https://example.test/systemone"))(
      state,
      questions,
    );

    expect(answers).toEqual(expected);

    const [request] = yield* Ref.get(sent);
    expect(request?.url.pathname).toBe("/systemone");
    expect(request?.headers["authorization"]).toBe("Bearer key-1");

    expect(request?.body).toEqual({
      model: "model-1",
      state,
      questions: {
        risk: {
          type: "choice",
          instructions: "How risky is the command?",
          criteria: { safe: "Reads only", risky: "Changes files" },
        },
        scope: {
          type: "score",
          instructions: "How much does it touch?",
          criteria: ["one", "many"],
        },
        network: {
          type: "noul",
          instructions: "Does it reach the network?",
          criteria: { true: "It connects out", false: "It stays local" },
        },
      },
    });
  }),
  Layer.empty,
);

effectTest(
  "OpenAI Decisions sends a named list with the state as text and reads predicates as yes or no",
  Effect.gen(function* () {
    const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);

    const http = stubHttp(sent, () =>
      json({
        answers: [
          {
            name: "risk",
            type: "choice",
            choice: "safe",
            probabilities: [
              { value: "safe", probability: 0.9 },
              { value: "risky", probability: 0.1 },
            ],
            confidence: 0.8,
          },
          { name: "scope", type: "score", score: 0.2, confidence: 0.7 },
          { name: "network", type: "predicate", probability: 0.05 },
        ],
      }),
    );

    const answers = yield* openAiDecisions(http, wire("https://example.test/decisions"))(
      state,
      questions,
    );

    expect(answers).toEqual(expected);

    const [request] = yield* Ref.get(sent);

    expect(request?.body).toEqual({
      model: "model-1",
      input: '{"command":"ls"}',
      questions: [
        {
          type: "choice",
          name: "risk",
          instructions: "How risky is the command?",
          choices: [
            { value: "safe", description: "Reads only" },
            { value: "risky", description: "Changes files" },
          ],
        },
        {
          type: "score",
          name: "scope",
          instructions: "How much does it touch?",
          levels: [{ label: "one" }, { label: "many" }],
        },
        {
          type: "predicate",
          name: "network",
          instructions:
            "Does it reach the network?\n\nTrue means: It connects out\nFalse means: It stays local",
        },
      ],
    });
  }),
  Layer.empty,
);

effectTest(
  "a refusal, a missing answer and an error status each fail the call",
  Effect.gen(function* () {
    const sent = yield* Ref.make<ReadonlyArray<Sent>>([]);

    const ask = (body: Schema.Json, status = 200) =>
      Effect.flip(
        openAiDecisions(
          stubHttp(sent, () => json(body, status)),
          wire("https://example.test/decisions"),
        )(state, questions),
      );

    const refused = yield* ask({ answers: [{ type: "refusal" }] });
    expect(refused.message).toContain("refused");

    const missing = yield* ask({
      answers: [{ name: "network", type: "predicate", probability: 1 }],
    });

    expect(missing.message).toContain("risk");

    const status = yield* ask({ error: "no" }, 401);
    expect(status).toBeInstanceOf(DecisionFailed);
  }),
  Layer.empty,
);
