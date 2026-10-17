/** The behavior every SessionStore provider shares; each provider's tests run it. */

import { describe, expect } from "bun:test";

import { Context, Effect, Layer } from "effect";

import type { BaseServices } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import {
  type NewEntry,
  SessionNotFound,
  SessionStore,
  type StoredEntry,
  StoreError,
} from "../src/contract.ts";

export interface ConformanceHarness<E> {
  /** A fresh provider over an empty medium. */
  readonly layer: Layer.Layer<SessionStore, E, BaseServices>;
  /** A new provider over the same medium, as after a restart. */
  readonly reopen?: Layer.Layer<SessionStore, E, BaseServices>;
}

/** The entry to append that is saved as `seq`. */
const draft = (seq: number): NewEntry => ({
  kind: "test/note",
  at: seq * 1000,
  data: JSON.stringify({ seq }),
  model: seq % 2 === 0 ? null : JSON.stringify([{ role: "user", parts: [] }]),
  text: `note ${seq}`,
  user: "shown",
});

const entry = (sessionId: string, seq: number): StoredEntry => ({ ...draft(seq), sessionId, seq });

const seqs = (entries: ReadonlyArray<StoredEntry>) => entries.map((saved) => saved.seq);

/** Runs `use` against a store built from `layer`, which closes when `use` ends. */
const withStore = <A, E, LayerError>(
  layer: Layer.Layer<SessionStore, LayerError, BaseServices>,
  use: (store: SessionStore["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.flatMap(Layer.build(layer), (context) => use(Context.get(context, SessionStore))),
  );

type Store = SessionStore["Service"];

/** Each case gets a fresh store over an empty medium. */
/** The error `effect` fails with; a success fails the test. */
const failureOf = <A, E>(effect: Effect.Effect<A, E>) => Effect.orDie(Effect.flip(effect));

type Case = (store: Store) => Effect.Effect<void, SessionNotFound | StoreError>;

const cases: ReadonlyArray<readonly [string, Case]> = [
  [
    "numbers a batch after the last seq and reads it back in order",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        const saved = yield* store.appendEntries("s1", [draft(1), draft(2), draft(3)]);
        expect(saved).toEqual([entry("s1", 1), entry("s1", 2), entry("s1", 3)]);
        expect(yield* store.readEntries("s1", {})).toEqual(saved);
      }),
  ],
  [
    "reads a range after and through a seq",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        yield* store.appendEntries("s1", [draft(1), draft(2), draft(3), draft(4)]);
        expect(seqs(yield* store.readEntries("s1", { after: 1, through: 3 }))).toEqual([2, 3]);
      }),
  ],
  [
    "an empty session numbers from 1",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        expect(yield* store.readEntries("s1", {})).toEqual([]);
        expect(seqs(yield* store.appendEntries("s1", [draft(1)]))).toEqual([1]);
        expect(seqs(yield* store.appendEntries("s1", [draft(2)]))).toEqual([2]);
      }),
  ],
  [
    "an unknown session is SessionNotFound",
    (store) =>
      Effect.gen(function* () {
        expect(yield* failureOf(store.readEntries("missing", {}))).toBeInstanceOf(SessionNotFound);

        expect(yield* failureOf(store.appendEntries("missing", [draft(1)]))).toBeInstanceOf(
          SessionNotFound,
        );

        expect(yield* failureOf(store.forkSession("f", "missing", 1))).toBeInstanceOf(
          SessionNotFound,
        );
      }),
  ],
  [
    "concurrent appends take distinct seqs",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        const batch = store.appendEntries("s1", [draft(1), draft(2)]);
        yield* Effect.all([batch, batch, batch], { concurrency: "unbounded" });
        expect(seqs(yield* store.readEntries("s1", {}))).toEqual([1, 2, 3, 4, 5, 6]);
      }),
  ],
  [
    "a fork reads its parent through the fork seq, then its own entries",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("parent");
        yield* store.appendEntries("parent", [draft(1), draft(2), draft(3)]);
        yield* store.forkSession("child", "parent", 2);
        expect(yield* store.appendEntries("child", [draft(3)])).toEqual([entry("child", 3)]);

        expect(yield* store.readEntries("child", {})).toEqual([
          entry("parent", 1),
          entry("parent", 2),
          entry("child", 3),
        ]);

        expect(seqs(yield* store.readEntries("child", { after: 1 }))).toEqual([2, 3]);
      }),
  ],
  [
    "lists sessions with their newest entry, most recently updated first",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        yield* store.appendEntries("s1", [draft(1), draft(2)]);
        yield* store.forkSession("s2", "s1", 1);

        expect(yield* store.listSessions).toEqual([
          { id: "s1", parentId: null, createdAt: 0, updatedAt: 2000, lastSeq: 2 },
          { id: "s2", parentId: "s1", createdAt: 0, updatedAt: 0, lastSeq: 1 },
        ]);
      }),
  ],
  [
    "the live slot is overwritten and cleared",
    (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        expect(yield* store.readLive("s1")).toBeUndefined();
        yield* store.writeLive("s1", { kind: "test/typing", data: "1" });
        yield* store.writeLive("s1", { kind: "test/typing", data: "2" });
        expect(yield* store.readLive("s1")).toEqual({ kind: "test/typing", data: "2" });
        yield* store.writeLive("s1");
        expect(yield* store.readLive("s1")).toBeUndefined();
      }),
  ],
];

const reopenCase = <E>(
  layer: Layer.Layer<SessionStore, E, BaseServices>,
  reopen: Layer.Layer<SessionStore, E, BaseServices>,
) =>
  Effect.gen(function* () {
    yield* withStore(layer, (store) =>
      Effect.gen(function* () {
        yield* store.createSession("s1");
        yield* store.appendEntries("s1", [draft(1)]);
        yield* store.writeLive("s1", { kind: "test/typing", data: "1" });
      }),
    );

    yield* withStore(reopen, (store) =>
      Effect.gen(function* () {
        expect(yield* store.readEntries("s1", {})).toEqual([entry("s1", 1)]);
        expect(yield* store.readLive("s1")).toEqual({ kind: "test/typing", data: "1" });
      }),
    );
  });

/** Registers the suite; `make` is called once per test, so each test starts on an empty medium. */
export const sessionStoreConformance = <E>(label: string, make: () => ConformanceHarness<E>) => {
  describe(`SessionStore conformance: ${label}`, () => {
    for (const [name, run] of cases) {
      effectTest(
        name,
        Effect.suspend(() => withStore(make().layer, run)),
        testBaseServices,
      );
    }

    if (make().reopen === undefined) return;

    effectTest(
      "entries and live state survive a reopen",
      Effect.suspend(() => {
        const harness = make();

        return reopenCase(harness.layer, harness.reopen ?? harness.layer);
      }),
      testBaseServices,
    );
  });
};
