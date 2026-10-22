/** One turn: steps of a model call and the tool calls it asks for, until the model answers. */
import { Cause, Effect, Exit, Fiber, Option } from "effect";

import type { Attributes } from "@shanepadgett/liminal-core";
import type { History } from "@shanepadgett/liminal-history/contract";
import type { ModelCall, Models } from "@shanepadgett/liminal-model/contract";
import {
  MessageEvent,
  Notice,
  type SessionId,
  type SessionLog,
} from "@shanepadgett/liminal-session/contract";
import type { SystemPrompt } from "@shanepadgett/liminal-system-prompt/contract";
import type { ToolList } from "@shanepadgett/liminal-tool-definitions/contract";
import type { ToolCall, Tools } from "@shanepadgett/liminal-tools/contract";

import type { BeforeCall, Turn, TurnEnd } from "./contract.ts";
import { cancelUnanswered } from "./recovery.ts";
import { streamReply } from "./reply.ts";
import type { Outcome, Sessions } from "./sessions.ts";
import { failTruncated, runCalls } from "./tool-calls.ts";

export interface TurnServices {
  readonly log: SessionLog["Service"];
  readonly systemPrompt: SystemPrompt["Service"];
  readonly toolList: ToolList["Service"];
  readonly history: History["Service"];
  readonly models: Models["Service"];
  readonly modelCall: ModelCall["Service"];
  readonly tools: Tools["Service"];
  readonly toolCall: ToolCall["Service"];
  readonly beforeCall: BeforeCall["Service"];
  readonly turnEnd: TurnEnd["Service"];
}

/** The session's next model request, read from its log. */
export const makeRequest = (services: TurnServices) =>
  Effect.fn("Turns.request")(function* (session: SessionId) {
    const { log, models, systemPrompt, toolList, history } = services;
    const events = yield* log.read(session);
    const { model, thinking } = yield* models.resolve("main");

    return {
      model,
      thinking,
      system: yield* systemPrompt.current(events),
      tools: yield* toolList.current(events),
      messages: yield* history.run(events),
      cacheKey: session,
    };
  });

const runHooks = (hooks: BeforeCall["Service"], turn: Turn) =>
  Effect.flatMap(hooks.list, (each) =>
    Effect.forEach(each, (hook) => hook(turn), { discard: true }),
  );

/** One model call and the tool calls it asks for; true when the model answered without calls. */
const makeStep = (services: TurnServices) => {
  const request = makeRequest(services);

  return Effect.fn("Loop.step")(function* (turn: Turn) {
    const { log, systemPrompt, toolList, beforeCall, turnEnd } = services;
    const { session, attributes } = turn;
    yield* systemPrompt.sync(session);
    yield* toolList.sync(session);
    yield* runHooks(beforeCall, turn);

    const reply = yield* streamReply(services, session, yield* request(session), attributes);

    if (reply.message.parts.length > 0) {
      yield* log.append(session, [yield* MessageEvent.make(reply.message, attributes)]);
    }

    const calls = reply.message.parts.filter((part) => part.type === "tool-call");

    if (calls.length === 0) {
      yield* runHooks(turnEnd, turn);

      return true;
    }

    yield* reply.truncated
      ? failTruncated(log, session, calls, attributes)
      : runCalls(services, session, calls, attributes);

    return false;
  });
};

/** How the steps ended; a failure is logged as a notice, a cancel gives open calls results. */
const settle = Effect.fn("Loop.settle")(function* (
  log: SessionLog["Service"],
  turn: Turn,
  exit: Exit.Exit<void, { readonly message: string }>,
) {
  if (Exit.isSuccess(exit)) return "answered" satisfies Outcome;

  const { cause } = exit;

  if (Cause.hasInterrupts(cause)) {
    yield* cancelUnanswered(log, turn.session, turn.attributes);

    return "cancelled" satisfies Outcome;
  }

  const reason = Option.match(Cause.findErrorOption(cause), {
    onNone: () => {
      const defect = Cause.squash(cause);

      return defect instanceof Error ? defect.message : "an unexpected error";
    },
    onSome: ({ message }) => message,
  });

  yield* log.append(turn.session, [
    yield* Notice.make({ level: "error", text: `The turn stopped: ${reason}` }, turn.attributes),
  ]);

  return "failed" satisfies Outcome;
});

/** Runs turns in `session` until it goes idle: steps, then the turn's end or the inputs that wait. */
export const makeRunTurn = (services: TurnServices, sessions: Sessions) => {
  const step = makeStep(services);

  const steps = (turn: Turn): Effect.Effect<void, Effect.Error<ReturnType<typeof step>>> =>
    Effect.gen(function* () {
      const steered = yield* sessions.takeSteers(turn.session);
      const current = { ...turn, attributes: Option.getOrElse(steered, () => turn.attributes) };

      if (!(yield* step(current))) yield* steps(current);
    });

  const runTurn = (session: SessionId, attributes: Attributes): Effect.Effect<void> =>
    Effect.gen(function* () {
      const turn = { session, attributes };
      const exit = yield* Fiber.await(yield* sessions.startSteps(session, steps(turn)));
      const next = yield* sessions.endTurn(session, yield* settle(services.log, turn, exit));

      if (Option.isSome(next)) yield* runTurn(session, next.value);
    }).pipe(Effect.catchCause((cause) => Effect.logError("A turn could not end", cause)));

  return runTurn;
};
