/** Model tasks: tools before an answer, one retry for a rejected answer, the step limit. */

import { expect } from "bun:test";

import { Effect, Predicate, Ref, Schema, Stream } from "effect";

import {
  defineTool,
  type ModelEvent,
  type ModelPart,
  type ModelRequest,
  SessionId,
} from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";

import { ModelSource, Models, ModelTask } from "../src/contract.ts";
import { provider, register, testLayer } from "./support.ts";

const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, reasoning: 0 };

const call = (name: string, params: Schema.Json): ModelPart => ({
  type: "tool-call",
  id: `call-${name}`,
  name,
  params,
  providerData: {},
});

const eventsOf = (parts: ReadonlyArray<ModelPart>): ReadonlyArray<ModelEvent> => [
  ...parts.map((part, index): ModelEvent => ({ type: "part-end", index, part })),
  { type: "finish", reason: "tool-calls", usage },
];

/** Registers provider `fake` that answers each request with the next of `replies`. */
const fakeProvider = Effect.fn("fakeProvider")(function* (
  replies: ReadonlyArray<ReadonlyArray<ModelPart>>,
) {
  const requests = yield* Ref.make<ReadonlyArray<ModelRequest>>([]);

  const stream = (request: ModelRequest) =>
    Stream.unwrap(
      Effect.map(
        Ref.updateAndGet(requests, (sent) => [...sent, request]),
        (sent) => Stream.fromIterable(eventsOf(replies[sent.length - 1] ?? [])),
      ),
    );

  const listed = ModelSource.Listed({ models: Effect.succeed([]) });
  yield* register(provider("fake", listed, stream));

  return requests;
});

const Verdict = Schema.Struct({ verdict: Schema.Literals(["approve", "ask"]) });

const echo = defineTool({
  name: "echo",
  description: "Says the text back.",
  parameters: Schema.Struct({ text: Schema.String }),
  runAlongside: true,
  safeToRerun: true,
  run: ({ text }) => Effect.succeed({ result: text }),
});

const runTask = Effect.fn("runTask")(function* (maxSteps: number) {
  const models = yield* Models;
  const task = yield* ModelTask;

  return yield* task.run({
    model: yield* models.cheap("fake"),
    sessionId: SessionId.make("s1"),
    system: "Review the call.",
    prompt: [{ role: "user", parts: [{ type: "text", text: "rm -rf build", providerData: {} }] }],
    tools: [echo],
    submit: { name: "submit_review", description: "Gives the verdict.", schema: Verdict },
    maxSteps,
  });
});

effectTest(
  "a task runs its tools, then returns the submitted answer from the provider's cheap model",
  Effect.gen(function* () {
    const requests = yield* fakeProvider([
      [call("echo", { text: "hi" })],
      [call("submit_review", { verdict: "approve" })],
    ]);

    expect(yield* runTask(3)).toEqual({ verdict: "approve" });

    const [first, second] = yield* Ref.get(requests);
    expect(first?.model).toEqual({ provider: "fake", id: "small" });
    expect(first?.toolChoice).toBe("required");
    expect(first?.tools.map((tool) => tool.name)).toEqual(["echo", "submit_review"]);
    expect(first?.messages[0]?.role).toBe("system");

    expect(second?.messages.at(-1)?.parts).toEqual([
      { type: "tool-result", callId: "call-echo", name: "echo", result: "hi", isFailure: false },
    ]);
  }),
  testLayer,
);

effectTest(
  "a rejected answer is sent back once with the submit tool forced; a second rejection fails",
  Effect.gen(function* () {
    const requests = yield* fakeProvider([
      [call("submit_review", { verdict: "maybe" })],
      [call("submit_review", { verdict: "never" })],
    ]);

    const failure = yield* Effect.flip(runTask(5));
    expect(Predicate.isTagged(failure, "TaskFailed")).toBe(true);

    const sent = yield* Ref.get(requests);
    expect(sent.length).toBe(2);
    expect(sent[1]?.toolChoice).toEqual({ tool: "submit_review" });
    expect(sent[1]?.messages.at(-1)?.parts[0]).toMatchObject({ isFailure: true });
  }),
  testLayer,
);

effectTest(
  "the last step forces the submit tool, and a task with no answer by then fails",
  Effect.gen(function* () {
    const requests = yield* fakeProvider([
      [call("echo", { text: "one" })],
      [call("echo", { text: "two" })],
    ]);

    const failure = yield* Effect.flip(runTask(2));
    expect(Predicate.isTagged(failure, "TaskFailed")).toBe(true);

    const sent = yield* Ref.get(requests);

    expect(sent.map((request) => request.toolChoice)).toEqual([
      "required",
      { tool: "submit_review" },
    ]);
  }),
  testLayer,
);
