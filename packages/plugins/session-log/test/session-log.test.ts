/** SessionLog over an in-memory store: seq stamping, validation, followers and the live slot. */

import { describe, expect } from "bun:test";

import { Deferred, Effect, Exit, Fiber, Predicate, Schema, Stream } from "effect";

import { effectTest, testPlugin } from "@liminal/sdk/testing";

import sessionLog from "../plugin.ts";
import {
  defineEntry,
  EntryKinds,
  InvalidEntry,
  Seq,
  SessionId,
  SessionLog,
  SessionNotFound,
  UnknownEntryKind,
} from "../src/contract.ts";
import { memoryStore } from "./memory-store.ts";

const Note = defineEntry({
  kind: "test/note",
  data: Schema.Struct({ body: Schema.String }),
  model: false,
  user: "shown",
});

const s1 = SessionId.make("s1");

const note = (body: string) => ({ kind: Note.kind, data: { body }, text: body });

const sessionLogLayer = () => testPlugin(sessionLog, memoryStore);

/** A test against a SessionLog with `test/note` registered and session `s1` created. */
const logTest = <E>(name: string, use: (log: SessionLog["Service"]) => Effect.Effect<void, E>) => {
  effectTest(
    name,
    Effect.gen(function* () {
      const kinds = yield* EntryKinds;
      yield* kinds.register(Note, { order: 0 });
      const log = yield* SessionLog;
      yield* log.create(s1);
      yield* use(log);
    }),
    sessionLogLayer(),
  );
};

describe("SessionLog", () => {
  logTest("append stamps consecutive seqs and read decodes them", (log) =>
    Effect.gen(function* () {
      yield* log.append(s1, [note("a")]);
      const appended = yield* log.append(s1, [note("b"), note("c")]);
      expect(appended.map((entry) => entry.seq)).toEqual([Seq.make(2), Seq.make(3)]);

      const read = yield* log.read(s1, { after: Seq.make(1) });
      expect(read.map((entry) => entry.data)).toEqual([{ body: "b" }, { body: "c" }]);
      expect(read[0]?.user).toBe("shown");
    }),
  );

  logTest("a batch with an unknown kind or bad data saves nothing", (log) =>
    Effect.gen(function* () {
      const unknown = yield* Effect.flip(
        log.append(s1, [note("a"), { kind: "test/missing", data: {}, text: "" }]),
      );

      expect(unknown).toBeInstanceOf(UnknownEntryKind);

      const invalid = yield* Effect.flip(
        log.append(s1, [{ kind: Note.kind, data: { body: 1 }, text: "" }]),
      );

      expect(invalid).toBeInstanceOf(InvalidEntry);
      expect(yield* log.read(s1, {})).toEqual([]);
    }),
  );

  logTest("an unknown session is SessionNotFound", (log) =>
    Effect.gen(function* () {
      const missing = SessionId.make("missing");

      expect(yield* Effect.flip(log.append(missing, [note("a")]))).toBeInstanceOf(SessionNotFound);

      expect(yield* Effect.flip(log.read(missing, {}))).toBeInstanceOf(SessionNotFound);
    }),
  );

  logTest("subscribe replays saved entries, sends Synced, then follows appends", (log) =>
    Effect.gen(function* () {
      yield* log.append(s1, [note("a")]);
      const synced = yield* Deferred.make<void>();

      const fiber = yield* log.subscribe(s1, {}).pipe(
        Stream.tap((item) =>
          Predicate.isTagged(item, "Synced") ? Deferred.done(synced, Exit.void) : Effect.void,
        ),
        Stream.take(4),
        Stream.runCollect,
        Effect.forkChild,
      );

      yield* Deferred.await(synced);
      yield* log.append(s1, [note("b")]);
      yield* log.append(s1, [note("c")]);

      const items = yield* Fiber.join(fiber);

      expect(
        items.map((item) =>
          Predicate.isTagged(item, "Synced") ? `synced ${item.seq}` : `entry ${item.seq}`,
        ),
      ).toEqual(["entry 1", "synced 1", "entry 2", "entry 3"]);
    }),
  );

  logTest("watchLive sends the saved slot, then each change", (log) =>
    Effect.gen(function* () {
      yield* log.setLive(s1, { kind: "test/typing", data: "a" });
      const started = yield* Deferred.make<void>();

      const fiber = yield* log.watchLive(s1).pipe(
        Stream.tap(() => Deferred.done(started, Exit.void)),
        Stream.take(3),
        Stream.runCollect,
        Effect.forkChild,
      );

      yield* Deferred.await(started);
      yield* log.setLive(s1, { kind: "test/typing", data: "b" });
      yield* log.setLive(s1);

      expect(yield* Fiber.join(fiber)).toEqual([
        { kind: "test/typing", data: "a" },
        { kind: "test/typing", data: "b" },
        undefined,
      ]);
    }),
  );

  effectTest(
    "an entry whose kind is gone reads back as JSON",
    Effect.gen(function* () {
      const kinds = yield* EntryKinds;
      const log = yield* SessionLog;
      yield* log.create(s1);

      yield* Effect.scoped(
        Effect.andThen(kinds.register(Note, { order: 0 }), log.append(s1, [note("a")])),
      );

      const [entry] = yield* log.read(s1, {});
      expect(entry?.data).toEqual({ body: "a" });
      expect(entry?.kind).toBe("test/note");
    }),
    sessionLogLayer(),
  );
});
