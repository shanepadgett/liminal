/**
 * The chain a call that runs things takes: the classifier, the reviewer, then the user. Every step
 * that fails sends the call on to the next; no one to ask denies it. The outcome is logged.
 */
import { Effect, Option } from "effect";

import { Attribute } from "@shanepadgett/liminal-core";
import type { SessionId, SessionLog } from "@shanepadgett/liminal-session/contract";

import { classify, isApproved, type Scores } from "./classify.ts";
import { type Answer, Decided, type Review, Unattended } from "./contract.ts";
import { review, type Reviewed, type Reviewer, type ReviewOutcome } from "./review.ts";

export type Judgement =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

type DecidedData = typeof Decided.schema.Type;

export const UNATTENDED_REASON =
  "No one is here to approve this call, so it did not run. Run with --yolo to allow every call.";

const ALLOWED: Judgement = { allowed: true };

const recordOf = ({ read, review: found }: ReviewOutcome): NonNullable<DecidedData["review"]> =>
  found.kind === "verdict" ? { read, verdict: found.verdict } : { read, failed: found.message };

/** Whether the reviewer allowed the call. */
const isAllowed = (found: Review) => found.kind === "verdict" && found.verdict.decision === "allow";

const rejected = (answer: Answer): Judgement => ({
  allowed: false,
  reason:
    answer.note === undefined || answer.note === ""
      ? "The user rejected this call."
      : `The user rejected this call: ${answer.note}`,
});

/** What judging a call needs: the reviewer's tools and the log the outcome goes to. */
export interface Judge extends Reviewer {
  readonly log: SessionLog["Service"];
}

export const logDecided = (deps: Judge, session: SessionId, decided: DecidedData) =>
  Effect.flatMap(Decided.make(decided), (event) => deps.log.append(session, [event]));

/**
 * Judges the call; `ask` puts the reviewer's finding to the user. A logging failure denies the
 * call, so nothing runs that the log does not show.
 */
export const judge = Effect.fn("Approvals.judge")(
  function* <E>(deps: Judge, reviewed: Reviewed, ask: (found: Review) => Effect.Effect<Answer, E>) {
    const { session, callId } = reviewed;
    const log = (decided: DecidedData) => logDecided(deps, session, decided);
    const scores = yield* classify(deps.models, reviewed.state);

    const scored = Option.match(scores, {
      onNone: () => ({ callId }),
      onSome: (value: Scores) => ({ callId, scores: value }),
    });

    if (Option.exists(scores, isApproved)) {
      yield* log({ ...scored, allowed: true, by: "classifier" });

      return ALLOWED;
    }

    const outcome = yield* review(deps, reviewed);
    const reviewedData = { ...scored, review: recordOf(outcome) };

    if (isAllowed(outcome.review)) {
      yield* log({ ...reviewedData, allowed: true, by: "reviewer" });

      return ALLOWED;
    }

    const unattended = yield* Attribute.get(reviewed.attributes, Unattended);

    if (Option.isSome(unattended)) {
      yield* log({ ...reviewedData, allowed: false, by: "unattended" });

      return { allowed: false, reason: UNATTENDED_REASON } satisfies Judgement;
    }

    const answer = yield* ask(outcome.review);
    const allowed = answer.decision === "approve";
    const decided = { ...reviewedData, allowed, by: "user" as const };
    yield* log(answer.note === undefined ? decided : { ...decided, note: answer.note });

    return allowed ? ALLOWED : rejected(answer);
  },
  (effect) =>
    effect.pipe(
      Effect.catch((error) =>
        Effect.succeed<Judgement>({
          allowed: false,
          reason: `Approval failed, so the call did not run: ${String(error)}`,
        }),
      ),
    ),
);
