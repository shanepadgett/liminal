/** Calling the model: streaming one attempt into live state, and retrying failed attempts. */

import { Effect, Exit, Fiber, Option, Ref, Result, Schedule, Stream } from "effect";

import type { Models } from "@liminal/models/contract";
import type { ModelError, ModelRequest, ProviderNotFound, SessionId } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";

import { AfterFailure, type AfterFailureHooks, type Turn } from "../contract.ts";
import { cancelledDrafts, saveDrafts } from "./calls.ts";
import {
  applyEvent,
  emptyReply,
  liveData,
  replyCalls,
  replyDrafts,
  type ReplyState,
} from "./reply.ts";

/** How often a streaming reply's live state is saved. */
const liveEvery = "100 millis";

export interface ModelCallDeps {
  readonly log: SessionLog["Service"];
  readonly models: Models["Service"];
  readonly afterFailure: AfterFailureHooks["Service"];
}

/**
 * One attempt: streams the reply, saving live state about every 100 ms, then saves the reply.
 * Interrupted, the output so far is saved marked interrupted and its tool calls as cancelled.
 */
const makeAttempt = ({ log, models }: ModelCallDeps) =>
  Effect.fn("AgentLoop.attempt")(function* (sessionId: SessionId, request: ModelRequest) {
    const reply = yield* Ref.make<ReplyState>(emptyReply);
    const dirty = yield* Ref.make(false);

    const flush = Effect.gen(function* () {
      if (!(yield* Ref.getAndSet(dirty, false))) return;

      yield* log.setLive(sessionId, {
        kind: "agent-loop/reply",
        data: liveData(yield* Ref.get(reply)),
      });
    }).pipe(Effect.orDie);

    const flusher = yield* Effect.forkChild(Effect.repeat(flush, Schedule.spaced(liveEvery)));

    /** Saves the reply, or on interrupt what streamed so far; a failed attempt saves nothing. */
    const settle = (exit: Exit.Exit<void, ModelError | ProviderNotFound>) =>
      Effect.gen(function* () {
        if (Exit.isFailure(exit) && !Exit.hasInterrupts(exit)) return;

        const state = yield* Ref.get(reply);
        const cancelled = Exit.isSuccess(exit) ? [] : cancelledDrafts(replyCalls(state));

        yield* saveDrafts(log, sessionId, [...replyDrafts(state), ...cancelled]);
        yield* log.setLive(sessionId);
      }).pipe(Effect.orDie);

    yield* Stream.runForEach(models.stream(request), (event) =>
      Effect.andThen(
        Ref.update(reply, (state) => applyEvent(state, event)),
        Ref.set(dirty, true),
      ),
    ).pipe(Effect.ensuring(Fiber.interrupt(flusher)), Effect.onExit(settle));

    return yield* Ref.get(reply);
  });

/** The first after-failure hook's retry delay, if any hook retries. */
const makeFirstRetry = ({ afterFailure }: ModelCallDeps) =>
  Effect.fn("AgentLoop.firstRetry")(function* (
    turn: Turn,
    error: ModelError | ProviderNotFound,
    attempts: number,
  ) {
    for (const hook of yield* afterFailure.list) {
      const decision = yield* hook(turn, error, attempts);
      if (AfterFailure.$is("Retry")(decision)) return Option.some(decision.after);
    }

    return Option.none();
  });

/** Calls the model, asking the after-failure hooks whether to retry each failed attempt. */
export const makeCallModel = (deps: ModelCallDeps) => {
  const { log } = deps;
  const attempt = makeAttempt(deps);
  const firstRetry = makeFirstRetry(deps);

  return Effect.fn("AgentLoop.callModel")(function* (turn: Turn, request: ModelRequest) {
    for (let attempts = 1; ; attempts += 1) {
      const result = yield* Effect.result(attempt(turn.sessionId, request));
      if (Result.isSuccess(result)) return result.success;

      const decision = yield* firstRetry(turn, result.failure, attempts);

      if (Option.isNone(decision)) {
        yield* log.setLive(turn.sessionId);

        return yield* result.failure;
      }

      yield* log.setLive(turn.sessionId, {
        kind: "agent-loop/retry",
        data: { attempt: attempts, message: result.failure.message },
      });

      yield* Effect.sleep(decision.value).pipe(
        Effect.onInterrupt(() => Effect.orDie(log.setLive(turn.sessionId))),
      );
    }
  });
};
