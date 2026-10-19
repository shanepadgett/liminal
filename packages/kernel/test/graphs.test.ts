/**
 * Graph changes over fixture plugins: a change rebuilds the changed package's plugins and their
 * dependents beside the running graph from freshly read files, work in flight keeps the graph it
 * started on, and a broken change keeps the current graph.
 */

import { describe, expect } from "bun:test";

import { Context, Deferred, Effect, Exit, Fiber, Predicate, Ref, Stream } from "effect";

import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { awaitState } from "./support/boot.ts";
import { current, rebuilt, started, writeFresh, writeSource } from "./support/plugins.ts";
import { Reader, Steady } from "./support/swap.ts";

describe("graph changes", () => {
  effectTest(
    "a change rebuilds the changed plugin and its dependents and keeps the rest",
    Effect.gen(function* () {
      const run = yield* started();
      const before = yield* current(run);
      yield* writeSource("two");
      yield* rebuilt(run, "source", run.touch("source"));
      const after = yield* current(run);

      expect([after.source.value, after.reader.value]).toEqual(["two", "two"]);
      expect(after.source).not.toBe(before.source);
      expect(after.reader).not.toBe(before.reader);
      expect(after.steady).toBe(before.steady);
      expect(yield* Ref.get(before.source.closed)).toBe(true);
      expect(yield* Ref.get(before.reader.closed)).toBe(true);
      expect(yield* Ref.get(before.steady.closed)).toBe(false);
    }),
    testBaseServices,
  );

  effectTest(
    "a plugins.json edit turns a plugin off and on again, keeping every other build",
    Effect.gen(function* () {
      const run = yield* started();
      const before = yield* current(run);

      yield* run.choose("steady", false);

      yield* run.kernel.graph.pipe(
        Stream.filter((members) => members.every((member) => member.name !== "steady")),
        Stream.runHead,
      );

      expect(yield* Ref.get(before.steady.closed)).toBe(true);
      yield* rebuilt(run, "steady", run.choose("steady", true));
      const after = yield* current(run);

      expect(after.source).toBe(before.source);
      expect(after.steady).not.toBe(before.steady);
    }),
    testBaseServices,
  );

  effectTest(
    "an edited plugin file runs fresh after the swap while the old build keeps its code",
    Effect.gen(function* () {
      const run = yield* started();
      const before = yield* current(run);
      yield* writeFresh(run.folder, "two");
      yield* rebuilt(run, "fresh", run.touch("fresh"));
      const after = yield* current(run);

      expect([before.fresh.value, after.fresh.value]).toEqual(["one", "two"]);
      expect(after.source).toBe(before.source);
    }),
    testBaseServices,
  );

  effectTest(
    "work in flight keeps the graph it started on until it ends",
    Effect.gen(function* () {
      const run = yield* started();
      const before = yield* current(run);
      const holding = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const step = yield* run.kernel
        .use((services) =>
          Deferred.done(holding, Exit.void).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as(Context.getUnsafe(services, Reader)),
          ),
        )
        .pipe(Effect.forkChild);

      yield* Deferred.await(holding);
      yield* writeSource("two");
      yield* rebuilt(run, "source", run.touch("source"));

      expect((yield* current(run)).reader.value).toBe("two");
      expect(yield* Ref.get(before.reader.closed)).toBe(false);
      yield* Deferred.done(release, Exit.void);
      const old = yield* Fiber.join(step);

      expect(old).toBe(before.reader);
      expect(old.value).toBe("one");
      expect(yield* Ref.get(old.closed)).toBe(true);
    }),
    testBaseServices,
  );

  effectTest(
    "a candidate's registrations stay hidden until it applies, and the old graph keeps its own",
    Effect.gen(function* () {
      const run = yield* started({ mode: () => Effect.succeed("confirmed") });

      const readersNow = run.kernel.use(
        (services) => Context.getUnsafe(services, Steady).readers.list,
      );

      const release = yield* Deferred.make<void>();

      const oldHolder = yield* run.kernel
        .use((services) =>
          Deferred.await(release).pipe(
            Effect.andThen(Context.getUnsafe(services, Steady).readers.list),
          ),
        )
        .pipe(Effect.forkChild);

      yield* writeSource("two");
      yield* run.touch("source");
      yield* awaitState(run.kernel, Predicate.isTagged("Ready"));

      expect(yield* readersNow).toEqual(["one"]);

      yield* rebuilt(run, "source", run.kernel.reloads.request);
      expect(yield* readersNow).toEqual(["two"]);

      yield* Deferred.done(release, Exit.void);
      expect(yield* Fiber.join(oldHolder)).toEqual(["one"]);
    }),
    testBaseServices,
  );

  effectTest(
    "a change that breaks a plugin keeps the current graph until a change fixes it",
    Effect.gen(function* () {
      const run = yield* started();
      const before = yield* current(run);
      yield* writeSource("fail");
      yield* run.touch("source");
      const failed = yield* awaitState(run.kernel, Predicate.isTagged("Failed"));

      expect(Predicate.isTagged(failed, "Failed") && failed.reason).toStartWith("source: ");
      const kept = yield* current(run);
      expect([kept.source, kept.reader]).toEqual([before.source, before.reader]);
      expect(yield* Ref.get(before.source.closed)).toBe(false);
      const status = yield* run.kernel.status;
      expect(status.every((plugin) => Predicate.isTagged(plugin, "Active"))).toBe(true);

      yield* writeSource("three");
      yield* rebuilt(run, "source", run.touch("source"));
      expect((yield* current(run)).reader.value).toBe("three");
    }),
    testBaseServices,
  );
});
