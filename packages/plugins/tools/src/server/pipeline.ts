/** The tool pipeline: checks, approvals, wrappers, then the tool's run. */

import { Effect, Layer, Option } from "effect";

import { Pipeline, Registry, type Tool } from "@liminal/sdk";

import {
  type AllowedCall,
  Approvals,
  ApprovalAnswer,
  type ToolCall,
  ToolChecks,
  ToolDecision,
  type ToolOutcome,
  ToolPipeline,
  ToolWrappers,
} from "../contract.ts";

const denied = (message: string): ToolOutcome => ({ status: "denied", message });

/** The tool's own run; a failure or crash becomes a failed outcome the model sees. */
const runTool = ({ call, tool }: AllowedCall): Effect.Effect<ToolOutcome> =>
  tool.run(call.params, { sessionId: call.sessionId, callId: call.callId }).pipe(
    Effect.map((output): ToolOutcome => ({ status: "done", output })),
    Effect.catchTag("ToolFailed", (error) =>
      Effect.succeed<ToolOutcome>({
        status: "failed",
        message: error.message,
        details: error.details,
      }),
    ),
    Effect.catchDefect((defect) =>
      Effect.succeed<ToolOutcome>({
        status: "failed",
        message: `the tool crashed: ${defect instanceof Error ? defect.message : String(defect)}`,
      }),
    ),
  );

const make = Effect.gen(function* () {
  const checks = yield* ToolChecks;
  const wrappers = yield* ToolWrappers;
  const approvals = yield* Effect.serviceOption(Approvals);

  /** The checks in order: the first deny ends them; asks are gathered. */
  const decide = Effect.fn("ToolPipeline.decide")(function* (call: ToolCall, tool: Tool) {
    const asks: Array<string> = [];

    for (const check of yield* checks.list) {
      const decision = yield* check(call, tool);

      if (ToolDecision.$is("Deny")(decision))
        return ApprovalAnswer.Deny({ reason: decision.reason });

      if (ToolDecision.$is("Ask")(decision)) asks.push(decision.reason);
    }

    if (asks.length === 0) return ApprovalAnswer.Allow();

    return yield* Option.match(approvals, {
      onNone: () =>
        Effect.succeed(
          ApprovalAnswer.Deny({ reason: "the call needs approval and no approval plugin is on" }),
        ),
      onSome: (service) => service.ask(call, asks.join("; ")),
    });
  });

  const run = Effect.fn("ToolPipeline.run")(function* (call: ToolCall, found: Option.Option<Tool>) {
    if (Option.isNone(found)) {
      return { status: "failed", message: `unknown tool: ${call.name}` } satisfies ToolOutcome;
    }

    const tool = found.value;
    const answer = yield* decide(call, tool);
    if (ApprovalAnswer.$is("Deny")(answer)) return denied(answer.reason);

    return yield* Pipeline.run(yield* wrappers.list, { call, tool }, runTool);
  });

  return ToolPipeline.of({ run });
});

/** The pipeline with its empty check and wrapper registries. */
export const pipeline = Layer.effect(ToolPipeline, make).pipe(
  Layer.provideMerge(Registry.layer(ToolChecks)),
  Layer.provideMerge(Registry.layer(ToolWrappers)),
);
