/** The turn loop: inputs into sessions, the turns they start, and each session's next request. */
import { Context, Effect, Fiber, Layer, Option } from "effect";

import { type Attributes, definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import { History } from "@shanepadgett/liminal-history/contract";
import { ModelCall, ModelProviders } from "@shanepadgett/liminal-model/contract";
import { type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import { SystemPrompt } from "@shanepadgett/liminal-system-prompt/contract";
import { ToolList } from "@shanepadgett/liminal-tool-definitions/contract";
import { ToolCall, Tools } from "@shanepadgett/liminal-tools/contract";

import {
  BeforeCall,
  CallFailed,
  type FailedHook,
  type Hook,
  Inbox,
  LoopRpc,
  Send,
  type SendRequest,
  SessionModel,
  TurnEnd,
  Turns,
} from "./contract.ts";
import { providerDefault } from "./session-model.ts";
import { makeSessions } from "./sessions.ts";
import { makeRequest, makeRunTurn, type TurnServices } from "./turn.ts";

const services = Effect.gen(function* () {
  const sessionModel = yield* Pipeline.make(providerDefault(yield* ModelProviders));

  const turns: TurnServices = {
    log: yield* SessionLog,
    systemPrompt: yield* SystemPrompt,
    toolList: yield* ToolList,
    history: yield* History,
    sessionModel,
    modelCall: yield* ModelCall,
    tools: yield* Tools,
    toolCall: yield* ToolCall,
    beforeCall: yield* BeforeCall,
    turnEnd: yield* TurnEnd,
    callFailed: yield* CallFailed,
  };

  return turns;
});

const make = Effect.gen(function* () {
  const turnServices = yield* services;
  const { log, systemPrompt, toolList } = turnServices;
  const sessions = yield* makeSessions(log);
  const runTurn = makeRunTurn(turnServices, sessions);
  const scope = yield* Effect.scope;

  const start = (session: SessionId, attributes: Attributes) =>
    Effect.asVoid(Effect.forkIn(runTurn(session, attributes), scope));

  const send = yield* Pipeline.make(({ session, input, mode }: SendRequest) =>
    Effect.flatMap(sessions.send(session, input, mode), (claimed) =>
      claimed ? start(session, input.attributes) : Effect.void,
    ),
  );

  const fold = Effect.fn("Turns.fold")(function* (session: SessionId) {
    yield* sessions.claimWhenIdle(session);
    yield* systemPrompt.fold(session);
    yield* toolList.fold(session);

    const next = yield* sessions.release(session);
    if (Option.isSome(next)) yield* start(session, next.value);
  });

  const cancel = Effect.fn("Inbox.cancel")(function* (session: SessionId) {
    const { inputs, step } = yield* sessions.empty(session);
    if (Option.isSome(step)) yield* Fiber.interrupt(step.value);

    return inputs;
  });

  return {
    send,
    inbox: Inbox.of({
      send: (session, input, mode = "steer") => send.run({ session, input, mode }),
      cancel,
      pullBack: (session) => Effect.map(sessions.empty(session), ({ inputs }) => inputs),
      state: sessions.state,
    }),
    turns: Turns.of({ request: makeRequest(turnServices), fold }),
    sessionModel: turnServices.sessionModel,
  };
});

const loop = Layer.effectContext(
  Effect.map(make, ({ send, inbox, turns, sessionModel }) =>
    Context.make(Send, send).pipe(
      Context.add(Inbox, inbox),
      Context.add(Turns, turns),
      Context.add(SessionModel, sessionModel),
    ),
  ),
);

const rpc = LoopRpc.toLayer(
  Effect.map(Inbox, (inbox) =>
    LoopRpc.of({
      "loop/send": ({ session, input, mode }) => inbox.send(session, input, mode),
      "loop/cancel": ({ session }) => inbox.cancel(session),
      "loop/pull-back": ({ session }) => inbox.pullBack(session),
      "loop/state": ({ session }) => inbox.state(session),
    }),
  ),
);

const registries = Layer.mergeAll(
  Layer.effect(BeforeCall, Registry.make<Hook>()),
  Layer.effect(TurnEnd, Registry.make<Hook>()),
  Layer.effect(CallFailed, Registry.make<FailedHook>()),
);

export default definePlugin({
  name: "loop",
  provides: [Inbox, Send, Turns, SessionModel, BeforeCall, TurnEnd, CallFailed],
  requires: [
    SessionLog,
    SystemPrompt,
    ToolList,
    History,
    ModelProviders,
    ModelCall,
    Tools,
    ToolCall,
  ],
  layer: Layer.provideMerge(rpc, Layer.provideMerge(loop, registries)),
});
