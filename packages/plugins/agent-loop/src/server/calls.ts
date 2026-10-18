/** Running a reply's tool calls and answering the calls a restart left without results. */

import { Effect, Option, Ref } from "effect";

import type { EntryDraft, SessionId, Tool } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";
import type { ToolOutcome, ToolPipeline } from "@liminal/tools/contract";

import { type CallPart, resultDraft, type ToolResult, unanswered } from "./reply.ts";

/** Saves `drafts` in one batch; saves nothing when there are none. */
export const saveDrafts = (
  log: SessionLog["Service"],
  sessionId: SessionId,
  drafts: ReadonlyArray<EntryDraft>,
) => {
  const [first, ...rest] = drafts;

  return first === undefined ? Effect.void : Effect.asVoid(log.append(sessionId, [first, ...rest]));
};

/** What the model sees of a call's outcome. */
const outcomeResult = (outcome: ToolOutcome): ToolResult =>
  outcome.status === "done"
    ? { status: "done", result: outcome.output.result, details: outcome.output.details }
    : { status: outcome.status, result: outcome.message, details: outcome.details };

const cancelled = (call: CallPart) =>
  resultDraft(call, { status: "cancelled", result: "cancelled", details: undefined });

/** Cancelled results for every call in `calls`. */
export const cancelledDrafts = (calls: ReadonlyArray<CallPart>) => calls.map(cancelled);

export const makeCalls = (log: SessionLog["Service"], pipeline: ToolPipeline["Service"]) => {
  /**
   * Runs `calls` through the pipeline and saves each result as it finishes. Interrupted, the calls
   * without a result are saved as cancelled.
   */
  const runCalls = Effect.fn("AgentLoop.runCalls")(function* (
    sessionId: SessionId,
    calls: ReadonlyArray<CallPart>,
    byName: ReadonlyMap<string, Tool>,
  ) {
    const answered = yield* Ref.make<ReadonlySet<string>>(new Set());
    const alongside = calls.every((call) => byName.get(call.name)?.runAlongside === true);

    const runOne = Effect.fn("AgentLoop.runCall")(function* (call: CallPart) {
      const outcome = yield* pipeline.run(
        { sessionId, callId: call.id, name: call.name, params: call.params },
        Option.fromUndefinedOr(byName.get(call.name)),
      );

      yield* Effect.uninterruptible(
        Effect.andThen(
          saveDrafts(log, sessionId, [resultDraft(call, outcomeResult(outcome))]),
          Ref.update(answered, (ids) => new Set([...ids, call.id])),
        ),
      );
    });

    const cancelRest = Effect.gen(function* () {
      const done = yield* Ref.get(answered);

      yield* saveDrafts(
        log,
        sessionId,
        cancelledDrafts(calls.filter((call) => !done.has(call.id))),
      );
    }).pipe(Effect.orDie);

    yield* Effect.forEach(calls, runOne, {
      concurrency: alongside ? "unbounded" : 1,
      discard: true,
    }).pipe(Effect.onInterrupt(() => cancelRest));
  });

  /** Answers tool calls a restart left without results: rerun if safe, else interrupted. */
  const answerUnanswered = Effect.fn("AgentLoop.answerUnanswered")(function* (
    sessionId: SessionId,
    byName: ReadonlyMap<string, Tool>,
  ) {
    const pending = unanswered(yield* log.read(sessionId, {}));
    const safe = (call: CallPart) => byName.get(call.name)?.safeToRerun === true;

    yield* saveDrafts(
      log,
      sessionId,
      pending.flatMap((call) =>
        safe(call)
          ? []
          : [
              resultDraft(call, {
                status: "interrupted",
                result: "interrupted by a restart",
                details: undefined,
              }),
            ],
      ),
    );

    yield* runCalls(sessionId, pending.filter(safe), byName);
  });

  return { runCalls, answerUnanswered };
};
