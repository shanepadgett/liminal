/** Archive lifecycle over real SQLite, with elapsed time controlled by the test clock. */

import { expect } from "bun:test";

import { Context, DateTime, Duration, Effect, Layer } from "effect";
import { RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";

import { Directories, draft, SessionId, SessionNotFound, StoreError } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionStore from "@liminal/session-store";
import { SessionStore, StoreError as StoredStoreError } from "@liminal/session-store/contract";

import sessionLog from "../plugin.ts";
import {
  ArchiveStateEntry,
  NamedEntry,
  SessionLog,
  SessionLogRpcs,
  TextEntry,
  userMessage,
} from "../src/contract.ts";

const services = serverOf(sessionLog).pipe(Layer.provideMerge(serverOf(sessionStore)));
const stack = services.pipe(Layer.provideMerge(testBaseServices));

const failedWrites = Layer.effect(
  SessionStore,
  Effect.gen(function* () {
    const store = yield* SessionStore;

    return SessionStore.of({
      ...store,
      appendEntries: () =>
        Effect.fail(
          new StoredStoreError({
            message: "Could not save archive: disk full",
            cause: "disk full",
          }),
        ),
    });
  }),
).pipe(Layer.provide(serverOf(sessionStore)));

const s1 = SessionId.make("s1");
const s2 = SessionId.make("s2");

const reply = draft(TextEntry, {
  data: { text: "answer", interrupted: false },
  text: "answer",
  model: [{ role: "assistant", parts: [{ type: "text", text: "answer", providerData: {} }] }],
});

effectTest(
  "expiry occurs at seven elapsed days and reads do not extend it",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage("hello")]);
    yield* TestClock.adjust(Duration.days(7).pipe(Duration.subtract(Duration.millis(1))));
    expect((yield* log.list)[0]?.archived).toBe(false);
    yield* log.read(s1, {});
    yield* log.setLive(s1, { kind: "test/typing", data: "read" });
    yield* TestClock.adjust("1 millis");
    expect((yield* log.list)[0]?.archived).toBe(true);
    expect(yield* log.read(s1, {})).toHaveLength(1);
    yield* log.append(s1, [userMessage("back")]);
    expect((yield* log.list)[0]?.archived).toBe(false);
  }),
  stack,
);

effectTest(
  "a manual archive survives output; only a later message restores it even at tied times",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage("hello")]);
    yield* log.setArchive(s1, "archive");
    yield* log.append(s1, [reply]);
    expect((yield* log.list)[0]?.archived).toBe(true);
    const saved = yield* log.read(s1, {});
    expect(saved[1]?.kind).toBe(ArchiveStateEntry.kind);
    expect(saved[1]?.user).toBe("hidden");
    expect(saved[1]?.model).toBeUndefined();
    yield* log.append(s1, [userMessage("continue")]);
    expect((yield* log.list)[0]?.archived).toBe(false);
  }),
  stack,
);

effectTest(
  "restore grants seven days without changing activity or conversation order",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage("older")]);
    yield* TestClock.adjust("1 hour");
    yield* log.create(s2);
    yield* log.append(s2, [userMessage("newer")]);
    const before = yield* log.list;
    yield* TestClock.adjust(Duration.days(8));
    yield* log.setArchive(s1, "restore");
    yield* log.append(s1, [draft(NamedEntry, { data: { name: "new name" }, text: "new name" })]);
    const restored = yield* log.list;
    expect(restored.map((row) => row.id)).toEqual([s2, s1]);
    expect(restored.map((row) => row.activityAt)).toEqual(before.map((row) => row.activityAt));
    expect(restored[1]?.archived).toBe(false);
    yield* TestClock.adjust(Duration.days(7));
    expect((yield* log.list)[1]?.archived).toBe(true);
  }),
  stack,
);

effectTest(
  "forks use their creation time and do not inherit archive commands or activity",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const store = yield* SessionStore;
    yield* log.create(s1);
    yield* log.append(s1, [userMessage("parent")]);
    yield* log.setArchive(s1, "archive");
    yield* TestClock.adjust(Duration.days(10));
    yield* store.forkSession(s2, s1, 2);
    const fork = (yield* log.list).find((row) => row.id === s2);
    expect(fork?.archived).toBe(false);
    expect(fork?.activityAt).toEqual(yield* DateTime.now);
    expect(yield* log.read(s2, {})).toHaveLength(2);
  }),
  stack,
);

effectTest(
  "archive RPC rejects missing and other-workspace sessions without writing",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const store = yield* SessionStore;
    const { workspace } = yield* Directories;
    yield* store.createSession(s2, workspace + "/elsewhere");

    const client = yield* RpcTest.makeClient(SessionLogRpcs);

    const missing = yield* Effect.flip(
      client["session-log/set-archive"]({ session: s1, action: "archive" }),
    );

    expect(missing).toBeInstanceOf(SessionNotFound);
    expect(yield* Effect.flip(log.setArchive(s2, "restore"))).toBeInstanceOf(SessionNotFound);
    expect(yield* store.readEntries(s2, {})).toEqual([]);
    expect(yield* log.list).toEqual([]);
  }),
  stack,
);

effectTest(
  "a failed archive write leaves the session active and its history unchanged",
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    expect(yield* Effect.flip(log.setArchive(s1, "archive"))).toBeInstanceOf(StoreError);
    expect((yield* log.list)[0]?.archived).toBe(false);
    expect(yield* log.read(s1, {})).toEqual([]);
  }),
  serverOf(sessionLog).pipe(Layer.provideMerge(failedWrites), Layer.provideMerge(testBaseServices)),
);

effectTest(
  "archive state survives rebuilding the log and reopening SQLite",
  Effect.gen(function* () {
    yield* Effect.scoped(
      Effect.gen(function* () {
        const log = Context.get(yield* Layer.build(services), SessionLog);
        yield* log.create(s1);
        yield* log.append(s1, [userMessage("durable")]);
        yield* log.setArchive(s1, "archive");
      }),
    );

    yield* Effect.scoped(
      Effect.gen(function* () {
        const log = Context.get(yield* Layer.build(services), SessionLog);
        expect((yield* log.list)[0]?.archived).toBe(true);
        yield* log.setArchive(s1, "restore");
        expect(yield* log.read(s1, {})).toHaveLength(3);
      }),
    );
  }),
  testBaseServices,
);
