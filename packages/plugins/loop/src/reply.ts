/** One model call: its deltas published as they arrive and added to the reply. */
import { Duration, Effect, Option, Ref, Stream } from "effect";
import type { Response } from "effect/ai";

import type { Attributes } from "@shanepadgett/liminal-core";
import {
  type ModelCall,
  type ModelDelta,
  type ModelRequest,
  Reply,
} from "@shanepadgett/liminal-model/contract";
import type { SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";

import { Interrupted, ReplyDelta } from "./contract.ts";
import { parsePartial } from "./partial-json.ts";

/** A tool call's params text as it streams, before the call arrives whole. */
interface ToolInput {
  readonly name: string;
  readonly text: string;
}

/** The reply so far, each tool call's input by call id, and how the reply ended. */
interface Streamed {
  readonly reply: Reply;
  readonly inputs: ReadonlyMap<string, ToolInput>;
  readonly finish: Option.Option<Response.FinishPart>;
}

const start: Streamed = { reply: Reply.empty, inputs: new Map(), finish: Option.none() };

type View = typeof ReplyDelta.schema.Type;

/** A tool call the provider runs itself never joins the reply, so its input is not shown. */
const addInput = (inputs: Streamed["inputs"], delta: ModelDelta): Streamed["inputs"] => {
  if (delta.type === "tool-params-start" && !delta.providerExecuted) {
    return new Map(inputs).set(delta.id, { name: delta.name, text: "" });
  }

  if (delta.type !== "tool-params-delta") return inputs;

  const input = inputs.get(delta.id);
  if (input === undefined) return inputs;

  return new Map(inputs).set(delta.id, { ...input, text: input.text + delta.delta });
};

const addDelta = (streamed: Streamed, delta: ModelDelta): Streamed => {
  if (delta.type === "retry") return start;

  return {
    reply: Reply.add(streamed.reply, delta),
    inputs: addInput(streamed.inputs, delta),
    finish: delta.type === "finish" ? Option.some(delta) : streamed.finish,
  };
};

const toolInputOf = (id: string, streamed: Streamed): Option.Option<View> =>
  Option.map(Option.fromUndefinedOr(streamed.inputs.get(id)), ({ name, text }): View => ({
    type: "tool-input",
    id,
    name,
    params: parsePartial(text),
  }));

/** What viewers see of `delta`, or none for parts they do not show. */
const viewOf = (delta: ModelDelta, streamed: Streamed): Option.Option<View> => {
  if (delta.type === "text-delta" || delta.type === "reasoning-delta") {
    const type = delta.type === "text-delta" ? "text" : "reasoning";

    return Option.some({ type, key: delta.id, text: delta.delta });
  }

  if (delta.type === "tool-params-delta") return toolInputOf(delta.id, streamed);

  if (delta.type === "tool-call") {
    return Option.fromUndefinedOr(
      streamed.reply.find(({ key }) => key === `tool-call:${delta.id}`)?.part,
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

/**
 * Calls the model and returns the whole reply and how it ended. Interrupted, it logs the reply so
 * far as `loop/interrupted`, which the model never sees.
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
    const next = yield* Ref.updateAndGet(streamed, (current) => addDelta(current, delta));
    const view = viewOf(delta, next);

    if (Option.isSome(view)) yield* log.publish(session, yield* ReplyDelta.make(view.value));
  });

  yield* Stream.runForEach(yield* modelCall.run(request), onDelta).pipe(
    Effect.onInterrupt(() => logPartial),
  );

  const { reply, finish } = yield* Ref.get(streamed);

  return { message: Reply.message(reply), finish };
});
