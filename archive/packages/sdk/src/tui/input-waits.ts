/** Input waits belong to workflows; notification delivery belongs to the attention plugin. */

import { Context, Effect, type Scope, type Stream } from "effect";

import * as Registry from "../core/registry.ts";
import type { SessionId } from "../core/session.ts";

export interface InputWait {
  readonly sessionId: SessionId;
  readonly source: string;
  readonly id: string;
}

export interface TuiInputWaitsService {
  readonly register: (wait: InputWait) => Effect.Effect<void, never, Scope.Scope>;
  readonly changes: Stream.Stream<ReadonlyArray<InputWait>>;
  readonly waitForUser: <A, E, R>(
    wait: InputWait,
    answer: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
}

export class TuiInputWaits extends Context.Service<TuiInputWaits, TuiInputWaitsService>()(
  "liminal/sdk/TuiInputWaits",
) {}

export const makeTuiInputWaits = Effect.gen(function* () {
  const registry = yield* Registry.make<InputWait>();
  const register = (wait: InputWait) => registry.register(wait, { order: 0 });

  const waitForUser = Effect.fn("TuiInputWaits.waitForUser")(function* <A, E, R>(
    wait: InputWait,
    answer: Effect.Effect<A, E, R>,
  ) {
    yield* register(wait);

    return yield* answer;
  }, Effect.scoped);

  return { register, changes: registry.changes, waitForUser } satisfies TuiInputWaitsService;
});
