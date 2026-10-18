/** Marks turns as running, so the kernel applies new code only between turns. */

import { Context, Effect, Semaphore, Stream, SubscriptionRef } from "effect";

export class TurnGate extends Context.Service<
  TurnGate,
  {
    /**
     * Runs `turn`; a reload waits until it ends. While a reload applies, the turn waits to start
     * until the reload is done.
     */
    readonly hold: <A, E, R>(turn: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  }
>()("liminal/TurnGate") {}

interface GateState {
  readonly holders: number;
  readonly isClosed: boolean;
}

/**
 * A gate and its owner's controls. `close` blocks new holds, waits until no turn runs, runs
 * `apply`, then opens again.
 */
export const makeTurnGate = Effect.gen(function* () {
  const state = yield* SubscriptionRef.make<GateState>({ holders: 0, isClosed: false });
  const closers = yield* Semaphore.make(1);

  const awaitState = (isReady: (current: GateState) => boolean) =>
    SubscriptionRef.changes(state).pipe(Stream.filter(isReady), Stream.take(1), Stream.runDrain);

  /** One attempt: a close can land between the wait and the count, so the count checks again. */
  const tryEnter = awaitState((current) => !current.isClosed).pipe(
    Effect.andThen(
      SubscriptionRef.modify(state, (current): [boolean, GateState] =>
        current.isClosed ? [false, current] : [true, { ...current, holders: current.holders + 1 }],
      ),
    ),
  );

  const enter = Effect.repeat(tryEnter, { until: (entered) => entered });

  const leave = SubscriptionRef.update(state, (current) => ({
    ...current,
    holders: current.holders - 1,
  }));

  const setClosed = (isClosed: boolean) =>
    SubscriptionRef.update(state, (current) => ({ ...current, isClosed }));

  const gate = TurnGate.of({
    hold: (turn) =>
      Effect.acquireUseRelease(
        enter,
        () => turn,
        () => leave,
      ),
  });

  const close = <A, E>(apply: Effect.Effect<A, E>) =>
    closers.withPermit(
      setClosed(true).pipe(
        Effect.andThen(awaitState((current) => current.holders === 0)),
        Effect.andThen(apply),
        Effect.ensuring(setClosed(false)),
      ),
    );

  return { gate, close };
});
