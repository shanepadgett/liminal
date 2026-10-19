/** Pending snapshots register asks for exactly as long as they remain pending. */

import { expect } from "bun:test";

import { Deferred, Effect, Fiber, Layer, Stream } from "effect";

import { SessionId } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";
import { makeTuiInputWaits, type TuiInputWaitsService } from "@liminal/sdk/tui";

import type { PendingAsk } from "../src/contract.ts";
import { trackAsks } from "../src/tui/input-waits.ts";

const ask = (id: string): PendingAsk => ({
  id,
  sessionId: SessionId.make("s1"),
  callId: id,
  tool: "shell",
  params: {},
  reason: "",
});

const active = (waits: TuiInputWaitsService) =>
  Stream.runHead(waits.changes).pipe(Effect.flatMap(Effect.fromOption));

effectTest(
  "pending asks reconcile additions and removals and release on completion",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;
    const lists = Stream.make([ask("a")], [ask("a")], [ask("a"), ask("b")], [ask("b")]);
    const snapshots: string[][] = [];

    yield* trackAsks(lists, waits).pipe(
      Stream.runForEach(
        Effect.fn(function* () {
          snapshots.push((yield* active(waits)).map(({ id }) => id));
        }),
      ),
    );

    expect(snapshots).toEqual([["a"], ["a"], ["a", "b"], ["b"]]);
    expect(yield* active(waits)).toEqual([]);
  }),
  Layer.empty,
);

effectTest(
  "a stream failure releases every pending ask",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;
    const lists = Stream.concat(Stream.make([ask("a"), ask("b")]), Stream.fail("disconnected"));
    expect(yield* Effect.flip(Stream.runDrain(trackAsks(lists, waits)))).toBe("disconnected");
    expect(yield* active(waits)).toEqual([]);
  }),
  Layer.empty,
);

effectTest(
  "disposal interrupts the watcher and releases pending asks",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;
    const ready = yield* Deferred.make<void>();
    const lists = Stream.concat(Stream.make([ask("a")]), Stream.never);

    const fiber = yield* trackAsks(lists, waits).pipe(
      Stream.tap(() => Deferred.complete(ready, Effect.void)),
      Stream.runDrain,
      Effect.forkScoped,
    );

    yield* Deferred.await(ready);
    expect((yield* active(waits)).map(({ id }) => id)).toEqual(["a"]);
    yield* Fiber.interrupt(fiber);
    expect(yield* active(waits)).toEqual([]);
  }),
  Layer.empty,
);
