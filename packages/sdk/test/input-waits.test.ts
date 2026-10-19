/** Wait registrations follow their scopes, not notification delivery. */

import { expect } from "bun:test";

import { Deferred, Effect, Fiber, Layer, Stream } from "effect";

import { SessionId } from "../src/core/session.ts";
import { effectTest } from "../src/testing/effect-test.ts";
import { makeTuiInputWaits, type TuiInputWaitsService } from "../src/tui/input-waits.ts";

const wait = { sessionId: SessionId.make("s1"), source: "test", id: "answer" };

const active = (waits: TuiInputWaitsService) =>
  Stream.runHead(waits.changes).pipe(Effect.flatMap(Effect.fromOption));

effectTest(
  "a wait preserves its answer and error and releases on either exit",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;

    const answer = waits.waitForUser(
      wait,
      Effect.gen(function* () {
        expect(yield* active(waits)).toEqual([wait]);

        return 42;
      }),
    );

    expect(yield* answer).toBe(42);
    expect(yield* active(waits)).toEqual([]);
    expect(yield* Effect.flip(waits.waitForUser(wait, Effect.fail("no answer")))).toBe("no answer");
    expect(yield* active(waits)).toEqual([]);
  }),
  Layer.empty,
);

effectTest(
  "interruption releases a wait",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;
    const started = yield* Deferred.make<void>();

    const fiber = yield* waits
      .waitForUser(wait, Effect.andThen(Deferred.complete(started, Effect.void), Effect.never))
      .pipe(Effect.forkScoped);

    yield* Deferred.await(started);
    expect(yield* active(waits)).toEqual([wait]);
    yield* Fiber.interrupt(fiber);
    expect(yield* active(waits)).toEqual([]);
  }),
  Layer.empty,
);

effectTest(
  "overlapping registrations with the same identity release independently",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;
    yield* waits.register(wait);

    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* waits.register(wait);
        expect(yield* active(waits)).toEqual([wait, wait]);
      }),
    );

    expect(yield* active(waits)).toEqual([wait]);

    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* waits.register({ ...wait, id: "another" });
        expect((yield* active(waits)).length).toBe(2);
      }),
    );

    expect(yield* active(waits)).toEqual([wait]);
  }),
  Layer.empty,
);
