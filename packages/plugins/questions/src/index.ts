/**
 * Questions: asks wait inside their tool call until the user's answer comes in as an input.
 * `/qna`'s request offers `ask_question` for the turn that takes it; every other turn withdraws
 * it.
 */
import { Deferred, Effect, Layer, Option, Ref, type Schema } from "effect";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Converters, defineConverter } from "@shanepadgett/liminal-history/contract";
import {
  BeforeCall,
  Inbox,
  Send,
  type SendRequest,
  type Turn,
  TurnStarted,
} from "@shanepadgett/liminal-loop/contract";
import { type SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import { ToolList } from "@shanepadgett/liminal-tool-definitions/contract";
import { Tools } from "@shanepadgett/liminal-tools/contract";

import {
  Answered,
  type Asker,
  Asked,
  askQuestionName,
  Questions,
  QuestionsRpc,
  Requested,
} from "./contract.ts";
import { makeAskQuestion } from "./tool.ts";

const REQUEST =
  "[qna] Ask me, with the ask_question tool, the questions you still need answered. Ask them again if you asked them already.";

/** An ask waiting for its answer. */
interface Waiting {
  readonly session: SessionId;
  readonly answer: Deferred.Deferred<Schema.Json>;
}

const makeQuestions = Effect.gen(function* () {
  const log = yield* SessionLog;
  const waiting = yield* Ref.make<ReadonlyMap<string, Waiting>>(new Map());

  const forget = (id: string) =>
    Ref.update(waiting, (all) => {
      const next = new Map(all);
      next.delete(id);

      return next;
    });

  const ask = Effect.fn("Questions.ask")(function* (
    { session, callId }: Asker,
    kind: string,
    data: Schema.Json,
  ) {
    const id = crypto.randomUUID();
    const answer = yield* Deferred.make<Schema.Json>();
    yield* Ref.update(waiting, (all) => new Map(all).set(id, { session, answer }));

    return yield* Effect.gen(function* () {
      yield* log.append(session, [yield* Asked.make({ id, callId, kind, data })]);

      return yield* Deferred.await(answer);
    }).pipe(Effect.ensuring(forget(id)));
  });

  /** An answer to a waiting ask is logged and wakes it; any other answer is dropped. */
  const answer = Effect.fn("Questions.answer")(function* ({ session, input }: SendRequest) {
    const answered = yield* Answered.decode(input);
    if (Option.isNone(answered)) return false;

    const { id } = answered.value;
    const waiter = (yield* Ref.get(waiting)).get(id);

    if (waiter?.session !== session) {
      yield* Effect.logWarning(`An answer came for ask ${id}, which no longer waits.`);

      return true;
    }

    yield* log.append(session, [input]);
    yield* Deferred.succeed(waiter.answer, answered.value.answer);

    return true;
  });

  return { service: Questions.of({ ask }), answer };
});

/** Whether the turn running in `session` took `/qna`'s request. */
const isRequested = (log: SessionLog["Service"], session: SessionId) =>
  Effect.map(log.read(session), (events) => {
    const start = events.findLastIndex((event) => event.kind === TurnStarted.kind);

    return events.slice(start + 1).some((event) => event.kind === Requested.kind);
  });

const register = Effect.gen(function* () {
  const log = yield* SessionLog;
  const toolList = yield* ToolList;
  const { service, answer } = yield* makeQuestions;

  yield* (yield* Tools).add(makeAskQuestion(service));

  yield* (yield* Send).wrap((request, next) =>
    Effect.flatMap(answer(request), (isAnswer) => (isAnswer ? Effect.void : next(request))),
  );

  yield* (yield* BeforeCall).add(({ session }: Turn) =>
    Effect.flatMap(isRequested(log, session), (requested) =>
      requested
        ? toolList.offer(session, [askQuestionName])
        : toolList.withdraw(session, [askQuestionName]),
    ),
  );

  yield* (yield* Converters).add(
    defineConverter(Requested, ({ text }) => [
      {
        role: "user",
        parts: [{ type: "text", text: text === "" ? REQUEST : `${REQUEST}\n\n${text}` }],
      },
    ]),
  );

  return service;
});

const rpc = QuestionsRpc.toLayer(
  Effect.gen(function* () {
    const inbox = yield* Inbox;

    return QuestionsRpc.of({
      "questions/qna": ({ session, text }) =>
        Effect.flatMap(Requested.make({ text: text.trim() }), (input) =>
          inbox.send(session, input, "follow-up"),
        ),
      "questions/answer": ({ session, id, answer: given }) =>
        Effect.flatMap(Answered.make({ id, answer: given }), (input) => inbox.send(session, input)),
    });
  }),
);

export default definePlugin({
  name: "questions",
  provides: [Questions],
  requires: [SessionLog, ToolList, Tools, Send, BeforeCall, Converters, Inbox],
  layer: Layer.provideMerge(rpc, Layer.effect(Questions, register)),
  entries: { tui: () => import("./tui/index.tsx") },
});
