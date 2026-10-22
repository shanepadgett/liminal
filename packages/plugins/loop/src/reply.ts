/** One model call: its deltas published as they arrive and folded into the reply. */
import { Duration, Effect, Option, Ref, Stream } from "effect";

import type { Attributes } from "@shanepadgett/liminal-core";
import {
  type ModelCall,
  type ModelDelta,
  type ModelRequest,
  Reply,
} from "@shanepadgett/liminal-model/contract";
import type { SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";

import { Interrupted, ReplyDelta } from "./contract.ts";

/** The reply so far, and whether the output limit cut it off. */
interface Streamed {
  readonly reply: Reply;
  readonly truncated: boolean;
}

const start: Streamed = { reply: Reply.empty, truncated: false };

/** What viewers see of `delta`, or none for parts they do not show. */
const viewOf = (delta: ModelDelta, reply: Reply): Option.Option<typeof ReplyDelta.schema.Type> => {
  if (delta.type === "text-delta" || delta.type === "reasoning-delta") {
    const type = delta.type === "text-delta" ? "text" : "reasoning";

    return Option.some({ type, key: delta.id, text: delta.delta });
  }

  if (delta.type === "tool-call") {
    return Option.fromUndefinedOr(
      reply.find(({ key }) => key === `tool-call:${delta.id}`)?.part,
    ).pipe(Option.filter((part) => part.type === "tool-call"));
  }

  if (delta.type === "retry") {
    return Option.some({
      type: "retry",
      attempt: delta.attempt,
      attempts: delta.attempts,
      delayMillis: Duration.toMillis(delta.delay),
      message: delta.message,
    });
  }

  return Option.none();
};

const fold = (streamed: Streamed, delta: ModelDelta): Streamed => {
  if (delta.type === "retry") return start;

  const reply = Reply.add(streamed.reply, delta);
  const truncated = streamed.truncated || (delta.type === "finish" && delta.reason === "length");

  return { reply, truncated };
};

/**
 * Calls the model and returns the whole reply. Interrupted, it logs the reply so far as
 * `loop/interrupted`, which the model never sees.
 */
export const streamReply = Effect.fn("Loop.streamReply")(function* (
  services: { readonly log: SessionLog["Service"]; readonly modelCall: ModelCall["Service"] },
  session: SessionId,
  request: ModelRequest,
  attributes: Attributes,
) {
  const { log, modelCall } = services;
  const streamed = yield* Ref.make(start);

  const logPartial = Effect.gen(function* () {
    const { reply } = yield* Ref.get(streamed);
    if (reply.length === 0) return;

    const event = yield* Interrupted.make({ message: Reply.message(reply) }, attributes);
    yield* log.append(session, [event]);
  }).pipe(Effect.ignore);

  const onDelta = Effect.fn("Loop.onDelta")(function* (delta: ModelDelta) {
    const next = yield* Ref.updateAndGet(streamed, (current) => fold(current, delta));
    const view = viewOf(delta, next.reply);

    if (Option.isSome(view)) yield* log.publish(session, yield* ReplyDelta.make(view.value));
  });

  yield* Stream.runForEach(yield* modelCall.run(request), onDelta).pipe(
    Effect.onInterrupt(() => logPartial),
  );

  const { reply, truncated } = yield* Ref.get(streamed);

  return { message: Reply.message(reply), truncated };
});
