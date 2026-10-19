/** Keep pending asks registered without changing their lifetime on repeated snapshots. */

import { Effect, Exit, Scope, Stream } from "effect";

import type { TuiInputWaitsService } from "@liminal/sdk/tui";

import type { PendingAsk } from "../contract.ts";

export const trackAsks = <E>(
  pending: Stream.Stream<ReadonlyArray<PendingAsk>, E>,
  waits: TuiInputWaitsService,
): Stream.Stream<ReadonlyArray<PendingAsk>, E> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const owner = yield* Effect.scope;
      const scopes = new Map<string, Scope.Closeable>();

      return pending.pipe(
        Stream.tap(
          Effect.fn("approval.trackAsks")(function* (asks) {
            const ids = new Set(asks.map(({ id }) => id));

            for (const [id, scope] of scopes) {
              if (ids.has(id)) continue;
              yield* Scope.close(scope, Exit.void);
              scopes.delete(id);
            }

            for (const ask of asks) {
              if (scopes.has(ask.id)) continue;
              const scope = yield* Scope.fork(owner);

              yield* waits
                .register({ sessionId: ask.sessionId, source: "approval", id: ask.id })
                .pipe(Effect.provideService(Scope.Scope, scope));

              scopes.set(ask.id, scope);
            }
          }),
        ),
      );
    }),
  );
