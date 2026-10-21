/**
 * Reloads at turn end over fixture plugins: changes are checked and applied only once no turn runs,
 * confirmed mode waits for the reload command, and a change to code loaded at start asks for a
 * restart once idle.
 */

import { describe, expect } from "bun:test";

import { Deferred, Effect, Exit, Fiber, Option, Predicate, Queue, Ref, Stream } from "effect";
import { ChildProcess } from "effect/process";

import { ReloadFailed, ReloadReady, type ReloadState } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { awaitState } from "./support/boot.ts";
import { current, rebuilt, started, type Started, writeSource } from "./support/plugins.ts";

const restartRoot = "/liminal-test-root";

const isReady = (state: ReloadState) => Predicate.isTagged(state, "Ready");

/** Starts a turn that runs `during` once the test releases it; returns the release and fiber. */
const holdTurn = Effect.fn("holdTurn")(function* <A>(run: Started, during: Effect.Effect<A>) {
  const { steady } = yield* current(run);
  const inTurn = yield* Deferred.make<void>();
  const release = yield* Deferred.make<void>();

  const turn = yield* steady
    .hold(
      Deferred.done(inTurn, Exit.void).pipe(
        Effect.andThen(Deferred.await(release)),
        Effect.andThen(during),
      ),
    )
    .pipe(Effect.forkChild);

  yield* Deferred.await(inTurn);

  return { release: Deferred.done(release, Exit.void), turn };
});

describe("reload at turn end", () => {
  effectTest(
    "a change during a turn applies only after the turn ends",
    Effect.gen(function* () {
      const run = yield* started();
      const before = yield* current(run);
      const turn = yield* holdTurn(run, current(run));
      yield* writeSource("two");
      yield* run.touch("source");
      yield* awaitState(run.kernel, Predicate.isTagged("Checking"));

      expect((yield* current(run)).source).toBe(before.source);
      yield* turn.release;
      expect((yield* Fiber.join(turn.turn)).source).toBe(before.source);
      yield* awaitState(run.kernel, Predicate.isTagged("Current"));
      expect((yield* current(run)).source.value).toBe("two");
    }),
    testBaseServices,
  );

  effectTest(
    "a change during a turn is checked only after the turn ends",
    Effect.gen(function* () {
      const run = yield* started({
        typecheck: Option.some(ChildProcess.make("/bin/sh", ["-c", "echo broken; exit 1"])),
      });

      const states = yield* Ref.make<ReadonlyArray<ReloadState>>([]);

      yield* run.kernel.reloads.state.pipe(
        Stream.runForEach((state) => Ref.update(states, (seen) => [...seen, state])),
        Effect.forkChild,
      );

      const turn = yield* holdTurn(run, Effect.void);
      yield* run.touch("source");
      yield* awaitState(run.kernel, Predicate.isTagged("Checking"));
      yield* Effect.yieldNow;
      expect((yield* Ref.get(states)).some(Predicate.isTagged("Failed"))).toBe(false);

      yield* turn.release;
      yield* Fiber.join(turn.turn);
      const failed = yield* awaitState(run.kernel, Predicate.isTagged("Failed"));

      expect(failed).toEqual(ReloadFailed.make({ reason: "broken" }));
    }),
    testBaseServices,
  );

  effectTest(
    "confirmed mode waits for the reload command",
    Effect.gen(function* () {
      const run = yield* started({ mode: () => Effect.succeed("confirmed") });
      yield* writeSource("two");
      yield* run.touch("source");
      const ready = yield* awaitState(run.kernel, isReady);

      expect(ready).toEqual(ReloadReady.make({ restart: false }));
      expect((yield* current(run)).source.value).toBe("one");
      yield* rebuilt(run, "source", run.kernel.reloads.request);
      expect((yield* current(run)).source.value).toBe("two");
    }),
    testBaseServices,
  );

  effectTest(
    "a change to code loaded at start asks for a restart only once no turn runs",
    Effect.gen(function* () {
      const run = yield* started({ restartRoots: [restartRoot] });
      const isDue = yield* Ref.make(false);
      const turn = yield* holdTurn(run, Effect.void);

      const due = yield* run.kernel.reloads.restartDue.pipe(
        Effect.andThen(Ref.set(isDue, true)),
        Effect.forkChild,
      );

      yield* Queue.offer(run.changes, [`${restartRoot}/kernel.ts`]);
      yield* awaitState(run.kernel, Predicate.isTagged("Checking"));
      yield* Effect.yieldNow;

      expect(yield* Ref.get(isDue)).toBe(false);
      yield* turn.release;
      yield* Fiber.join(due);
      expect(yield* Ref.get(isDue)).toBe(true);
    }),
    testBaseServices,
  );

  effectTest(
    "a restart whose start check fails keeps the running code",
    Effect.gen(function* () {
      const run = yield* started({
        restartRoots: [restartRoot],
        startCheck: ChildProcess.make("/bin/sh", ["-c", "echo broken boot; exit 1"]),
      });

      yield* Queue.offer(run.changes, [`${restartRoot}/kernel.ts`]);
      const failed = yield* awaitState(run.kernel, Predicate.isTagged("Failed"));

      expect(failed).toEqual(ReloadFailed.make({ reason: "broken boot" }));
    }),
    testBaseServices,
  );
});
