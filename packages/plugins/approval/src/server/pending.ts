/** The asks waiting for the user: each waits on its own answer and leaves the list once it ends. */

import { Deferred, Effect, Stream, SubscriptionRef } from "effect";

import type { SessionId } from "@liminal/sdk";
import { ApprovalAnswer } from "@liminal/tools/contract";

import type { PendingAsk } from "../contract.ts";

interface Waiting {
  readonly ask: PendingAsk;
  readonly answer: Deferred.Deferred<ApprovalAnswer>;
}

export interface Pending {
  /** Waits for the user's answer; interrupting it, as a cancelled turn does, withdraws the ask. */
  readonly ask: (ask: PendingAsk) => Effect.Effect<ApprovalAnswer>;
  readonly answer: (id: string, approve: boolean, note: string) => Effect.Effect<void>;
  readonly list: (session: SessionId) => Stream.Stream<ReadonlyArray<PendingAsk>>;
}

/** What the model reads when the user rejects a call. */
const rejection = (note: string) =>
  note.trim() === "" ? "the user rejected the call" : `the user rejected the call: ${note.trim()}`;

const idsOf = (asks: ReadonlyArray<PendingAsk>) => asks.map((ask) => ask.id).join("\n");

export const makePending = Effect.gen(function* () {
  const waiting = yield* SubscriptionRef.make<ReadonlyArray<Waiting>>([]);

  const ask = (pending: PendingAsk) =>
    Effect.flatMap(Deferred.make<ApprovalAnswer>(), (answer) => {
      const entry: Waiting = { ask: pending, answer };

      return Effect.acquireUseRelease(
        SubscriptionRef.update(waiting, (list) => [...list, entry]),
        () => Deferred.await(answer),
        () => SubscriptionRef.update(waiting, (list) => list.filter((each) => each !== entry)),
      );
    });

  const answer = (id: string, approve: boolean, note: string) =>
    Effect.flatMap(SubscriptionRef.get(waiting), (list) => {
      const found = list.find((each) => each.ask.id === id);
      if (found === undefined) return Effect.void;

      const given = approve
        ? ApprovalAnswer.Allow()
        : ApprovalAnswer.Deny({ reason: rejection(note) });

      return Effect.asVoid(Deferred.succeed(found.answer, given));
    });

  const list = (session: SessionId) =>
    SubscriptionRef.changes(waiting).pipe(
      Stream.map((all) =>
        all.flatMap((each) => (each.ask.sessionId === session ? [each.ask] : [])),
      ),
      Stream.changesWith((left, right) => idsOf(left) === idsOf(right)),
    );

  const pending: Pending = { ask, answer, list };

  return pending;
});
