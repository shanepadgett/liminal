/** Tool calls through the pipeline: checks, approvals, wrappers and failures the model sees. */

import { expect } from "bun:test";

import { Effect, Layer, Option, Schema } from "effect";

import { defineTool, SessionId, type Tool } from "@liminal/sdk";
import { effectTest, testPlugin } from "@liminal/sdk/testing";

import toolPipeline from "../plugin.ts";
import {
  ApprovalAnswer,
  Approvals,
  type ToolCall,
  ToolChecks,
  ToolDecision,
  ToolPipeline,
  ToolWrappers,
} from "../src/contract.ts";

const pipelineLayer = testPlugin(toolPipeline, Layer.empty);

const echo = defineTool({
  name: "echo",
  description: "Echoes text",
  parameters: Schema.Struct({ text: Schema.String }),
  runAlongside: true,
  safeToRerun: true,
  run: ({ text }) => Effect.succeed({ result: text }),
});

const crash = defineTool({
  name: "crash",
  description: "Crashes",
  parameters: Schema.Struct({}),
  runAlongside: true,
  safeToRerun: true,
  run: () => Effect.die(new Error("boom")),
});

const callOf = (name: string, params: Schema.Json): ToolCall => ({
  sessionId: SessionId.make("s1"),
  callId: "c1",
  name,
  params,
});

const runCall = Effect.fn("runCall")(function* (tool: Tool, params: Schema.Json) {
  const pipeline = yield* ToolPipeline;

  return yield* pipeline.run(callOf(tool.spec.name, params), Option.some(tool));
});

effectTest(
  "unknown tools, wrong params and crashes become failed outcomes",
  Effect.gen(function* () {
    const pipeline = yield* ToolPipeline;

    expect(yield* pipeline.run(callOf("missing", {}), Option.none())).toEqual({
      status: "failed",
      message: "unknown tool: missing",
    });

    expect(yield* runCall(echo, { text: "hi" })).toEqual({
      status: "done",
      output: { result: "hi" },
    });

    expect((yield* runCall(echo, { text: 1 })).status).toBe("failed");

    expect(yield* runCall(crash, {})).toEqual({
      status: "failed",
      message: "the tool crashed: boom",
    });
  }),
  pipelineLayer,
);

effectTest(
  "the first deny is final, and an ask without an approval plugin is denied",
  Effect.gen(function* () {
    const checks = yield* ToolChecks;
    let ran = 0;

    yield* checks.register(() => Effect.succeed(ToolDecision.Ask({ reason: "writes" })), {
      order: 0,
    });

    expect(yield* runCall(echo, { text: "hi" })).toEqual({
      status: "denied",
      message: "the call needs approval and no approval plugin is on",
    });

    yield* checks.register(() => Effect.succeed(ToolDecision.Deny({ reason: "blocked" })), {
      order: 1,
    });

    yield* checks.register(
      () => Effect.sync(() => (ran += 1)).pipe(Effect.as(ToolDecision.Allow())),
      { order: 2 },
    );

    expect(yield* runCall(echo, { text: "hi" })).toEqual({ status: "denied", message: "blocked" });
    expect(ran).toBe(0);
  }),
  pipelineLayer,
);

const saysYes = Schema.is(Schema.Struct({ text: Schema.Literal("yes") }));

const approvals = Layer.succeed(Approvals)({
  ask: (call, reason) =>
    Effect.succeed(
      saysYes(call.params)
        ? ApprovalAnswer.Allow()
        : ApprovalAnswer.Deny({ reason: `user said no to ${reason}` }),
    ),
});

effectTest(
  "an ask goes to the approval plugin, and wrappers run around allowed calls",
  Effect.gen(function* () {
    yield* (yield* ToolChecks).register(
      () => Effect.succeed(ToolDecision.Ask({ reason: "writes" })),
      { order: 0 },
    );

    yield* (yield* ToolWrappers).register(
      (_allowed, next) =>
        Effect.map(next, (outcome) =>
          outcome.status === "done"
            ? {
                status: "done",
                output: { result: `wrapped ${JSON.stringify(outcome.output.result)}` },
              }
            : outcome,
        ),
      { order: 0 },
    );

    expect(yield* runCall(echo, { text: "yes" })).toEqual({
      status: "done",
      output: { result: 'wrapped "yes"' },
    });

    expect(yield* runCall(echo, { text: "no" })).toEqual({
      status: "denied",
      message: "user said no to writes",
    });
  }),
  testPlugin(toolPipeline, Layer.empty).pipe(Layer.provide(approvals)),
);
