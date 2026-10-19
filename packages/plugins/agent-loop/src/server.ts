/** Agent-loop's server: runs each step from the session log and the checkpoints plugins join. */

import { Effect, Layer } from "effect";

import { Context } from "@liminal/context/contract";
import { Models } from "@liminal/models/contract";
import {
  type ModelRequest,
  Registry,
  type SessionId,
  ThinkingOff,
  thinkingOptionOf,
  type Tool,
} from "@liminal/sdk";
import { SessionLog, type TurnSettings } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ToolPipeline } from "@liminal/tools/contract";
import { Tools } from "@liminal/tools/contract";

import {
  AfterFailureHooks,
  AgentLoop,
  AgentLoopRpcs,
  BeforeCallHooks,
  StepOutcome,
  type Turn,
  type TurnEnd,
  TurnEndingHooks,
} from "./contract.ts";
import { makeCalls } from "./server/calls.ts";
import { makeDefaults } from "./server/defaults.ts";
import { makeHooks } from "./server/hooks.ts";
import { makeCallModel } from "./server/model-call.ts";
import { repeatsOf } from "./server/repeats.ts";
import { replyCalls } from "./server/reply.ts";
import { makeTurns } from "./server/turns.ts";

/** Before other hooks, so a looping turn ends before they do any work. */
const repeatsOrder = -10;

const make = Effect.gen(function* () {
  const log = yield* SessionLog;
  const context = yield* Context;
  const tools = yield* Tools;

  const beforeCall = yield* BeforeCallHooks;
  yield* beforeCall.register(repeatsOf(log), { order: repeatsOrder });

  const { runBeforeCall, runTurnEnding } = makeHooks(log, beforeCall, yield* TurnEndingHooks);

  const { runCalls, answerUnanswered } = makeCalls(log, yield* ToolPipeline);

  const models = yield* Models;

  const callModel = makeCallModel({ log, models, afterFailure: yield* AfterFailureHooks });

  /** The chosen option when the model offers it, else the model's default, else no thinking. */
  const thinkingOf = Effect.fn("AgentLoop.thinkingOf")(function* (settings: TurnSettings) {
    const info = yield* models.describe(settings.model);

    return thinkingOptionOf(info, settings.thinking)?.value ?? ThinkingOff.make({});
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
      thinking: yield* thinkingOf(settings),
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

  const { started, ...defaults } = yield* makeDefaults({ settings: yield* Settings, models, log });

  return AgentLoop.of({
    step,
    run,
    start: (sessionId, settings) =>
      turns.start(sessionId, settings).pipe(Effect.tap(() => started(sessionId))),
    ...defaults,
    cancel: turns.cancel,
  });
});

const rpcs = AgentLoopRpcs.toLayer(
  Effect.gen(function* () {
    const loop = yield* AgentLoop;

    return AgentLoopRpcs.of({
      "agent-loop/session-defaults": ({ session }) => loop.sessionDefaults(session),
      "agent-loop/pick": ({ session, model, thinking }) => loop.pick(session, model, thinking),
      "agent-loop/cycle-thinking": ({ session }) => loop.cycleThinking(session),
    });
  }),
);

export const layer = rpcs.pipe(
  Layer.provideMerge(Layer.effect(AgentLoop, make)),
  Layer.provideMerge(Registry.layer(BeforeCallHooks)),
  Layer.provideMerge(Registry.layer(AfterFailureHooks)),
  Layer.provideMerge(Registry.layer(TurnEndingHooks)),
);
