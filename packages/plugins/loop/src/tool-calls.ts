/**
 * A reply's tool calls: run together unless one is sequential, each result published as it finishes
 * and logged in the order the model asked.
 */
import { Deferred, Effect, Option, Ref } from "effect";

import type { Attributes } from "@shanepadgett/liminal-core";
import type {
  ModelId,
  ToolCall as ToolCallPart,
  ToolResult,
} from "@shanepadgett/liminal-model/contract";
import type { SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";
import type { ToolCall, Tools } from "@shanepadgett/liminal-tools/contract";

import { ToolDone } from "./contract.ts";
import { cancelledResult, resultEvents, standIn } from "./recovery.ts";

export interface CallServices {
  readonly log: SessionLog["Service"];
  readonly tools: Tools["Service"];
  readonly toolCall: ToolCall["Service"];
}

/** The step whose calls run: its session, the turn's attributes and the model the step ran. */
export interface CallStep {
  readonly session: SessionId;
  readonly attributes: Attributes;
  readonly model: ModelId;
}

const logResults = (
  log: SessionLog["Service"],
  session: SessionId,
  results: ReadonlyArray<ToolResult>,
  attributes: Attributes,
) =>
  Effect.flatMap(resultEvents(results, attributes), ([first, ...rest]) =>
    first === undefined ? Effect.void : Effect.asVoid(log.append(session, [first, ...rest])),
  );

/** Failed results for calls a reply cut off at the output limit asked for. */
export const failTruncated = (
  log: SessionLog["Service"],
  session: SessionId,
  calls: ReadonlyArray<ToolCallPart>,
  attributes: Attributes,
) =>
  logResults(
    log,
    session,
    calls.map((call) =>
      standIn(
        call,
        "The reply hit the output limit, so this call's params may be cut off. Try again with less output.",
      ),
    ),
    attributes,
  );

/**
 * Runs `calls` and logs each result in order. A cancel logs the results that finished and a
 * cancelled result for each call still running.
 */
export const runCalls = Effect.fn("Loop.runCalls")(function* (
  services: CallServices,
  step: CallStep,
  calls: ReadonlyArray<ToolCallPart>,
) {
  const { log, tools, toolCall } = services;
  const { session, attributes, model } = step;
  const registered = yield* tools.list;

  const isSequential = calls.some(
    (call) => registered.findLast(({ name }) => name === call.name)?.sequential === true,
  );

  const pending = yield* Effect.forEach(calls, (call) =>
    Effect.map(Deferred.make<ToolResult>(), (slot) => ({ call, slot })),
  );

  const runOne = Effect.fn("Loop.runCall")(function* ({ call, slot }: (typeof pending)[number]) {
    const result = yield* toolCall.run({ session, call, attributes, model });
    yield* log.publish(session, yield* ToolDone.make(result));
    yield* Deferred.succeed(slot, result);
  });

  yield* Effect.forkChild(
    Effect.forEach(pending, runOne, { concurrency: isSequential ? 1 : "unbounded", discard: true }),
  );

  const logged = yield* Ref.make(0);

  const logCancelled = Effect.gen(function* () {
    const open = pending.slice(yield* Ref.get(logged));

    const results = yield* Effect.forEach(open, ({ call, slot }) =>
      Effect.map(Deferred.poll(slot), (done) =>
        Option.isSome(done) ? done.value : Effect.succeed(cancelledResult(call)),
      ),
    );

    yield* logResults(log, session, yield* Effect.all(results), attributes);
  }).pipe(Effect.ignore);

  yield* Effect.forEach(
    pending,
    ({ slot }) =>
      Effect.flatMap(Deferred.await(slot), (result) =>
        Effect.uninterruptible(
          Effect.andThen(
            logResults(log, session, [result], attributes),
            Ref.update(logged, (count) => count + 1),
          ),
        ),
      ),
    { discard: true },
  ).pipe(Effect.onInterrupt(() => logCancelled));
});
