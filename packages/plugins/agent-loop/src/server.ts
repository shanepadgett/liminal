/** Agent-loop's server: runs each step from the session log and the checkpoints plugins join. */

import { Effect, Layer } from "effect";

import { Context } from "@liminal/context/contract";
import { Models } from "@liminal/models/contract";
import { type ModelRequest, Registry, type SessionId, type Tool } from "@liminal/sdk";
import { SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ToolPipeline } from "@liminal/tool-pipeline/contract";
import { Tools } from "@liminal/tool-registry/contract";

import {
  AfterFailureHooks,
  AgentLoop,
  AgentLoopRpcs,
  BeforeCallHooks,
  StepOutcome,
  type Turn,
  type TurnEnd,
  TurnEndingHooks,
  type TurnSettings,
} from "./contract.ts";
import { makeCalls } from "./server/calls.ts";
import { makeDefaults } from "./server/defaults.ts";
import { makeHooks } from "./server/hooks.ts";
import { makeCallModel } from "./server/model-call.ts";
import { replyCalls } from "./server/reply.ts";
import { makeTurns } from "./server/turns.ts";

const make = Effect.gen(function* () {
  const log = yield* SessionLog;
  const context = yield* Context;
  const tools = yield* Tools;

  const { runBeforeCall, runTurnEnding } = makeHooks(
    log,
    yield* BeforeCallHooks,
    yield* TurnEndingHooks,
  );

  const { runCalls, answerUnanswered } = makeCalls(log, yield* ToolPipeline);

  const callModel = makeCallModel({
    log,
    models: yield* Models,
    afterFailure: yield* AfterFailureHooks,
  });

  const step = Effect.fn("AgentLoop.step")(function* (
    sessionId: SessionId,
    settings: TurnSettings,
  ) {
    const turn: Turn = { sessionId, settings };
    const byName = new Map<string, Tool>((yield* tools.list).map((tool) => [tool.spec.name, tool]));

    yield* answerUnanswered(sessionId, byName);

    const before = yield* runBeforeCall(turn);
    if (!StepOutcome.$is("Continue")(before)) return before;

    const built = yield* context.build(sessionId, settings.model);

    const request: ModelRequest = {
      ...built,
      thinking: settings.thinking,
      cacheKey: sessionId,
      maxOutputTokens: settings.maxOutputTokens,
    };

    const reply = yield* callModel(turn, request);

    const calls = replyCalls(reply);

    if (calls.length > 0) {
      yield* runCalls(sessionId, calls, byName);

      return StepOutcome.Continue();
    }

    return yield* runTurnEnding(turn);
  });

  const run = Effect.fn("AgentLoop.run")(function* (sessionId: SessionId, settings: TurnSettings) {
    for (;;) {
      const outcome = yield* step(sessionId, settings);
      if (!StepOutcome.$is("Continue")(outcome)) return outcome satisfies TurnEnd;
    }
  });

  const turns = yield* makeTurns(log);
  yield* turns.resume;

  return AgentLoop.of({
    step,
    run,
    start: turns.start,
    ...(yield* makeDefaults(yield* Settings)),
    cancel: turns.cancel,
  });
});

const rpcs = AgentLoopRpcs.toLayer(
  Effect.gen(function* () {
    const loop = yield* AgentLoop;

    return AgentLoopRpcs.of({
      "agent-loop/defaults": () => loop.defaultsChanges,
      "agent-loop/set-default": ({ model, thinking }) => loop.setDefault(model, thinking),
    });
  }),
);

export const layer = rpcs.pipe(
  Layer.provideMerge(Layer.effect(AgentLoop, make)),
  Layer.provideMerge(Registry.layer(BeforeCallHooks)),
  Layer.provideMerge(Registry.layer(AfterFailureHooks)),
  Layer.provideMerge(Registry.layer(TurnEndingHooks)),
);
