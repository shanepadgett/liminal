/**
 * The holder serves commands on its socket: a quick command exits within the start's wait, a long
 * one keeps running until stopped, waits end on a matching line, typing reaches a terminal, and an
 * exit is reported once.
 */

import { expect, test } from "bun:test";

import { Duration, Effect, Layer, Path, Predicate } from "effect";
import { TestClock } from "effect/testing";

import { Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { Exited, Stopped } from "../src/contract.ts";
import { makeOutputBuffer } from "../src/server/holder/buffer.ts";
import { socketName } from "../src/server/holder/protocol.ts";
import { holderClient, serveHolder } from "../src/server/holder/serve.ts";

const session = "s1";
const base = Layer.empty.pipe(Layer.provideMerge(testBaseServices));

/** A client of a holder served in this test's scope. */
const served = Effect.gen(function* () {
  const path = (yield* Path.Path).join((yield* Directories).temp, socketName);
  yield* Effect.forkScoped(serveHolder(path, Duration.hours(1)));
  yield* Effect.sleep("100 millis");

  return yield* holderClient(path);
});

const start = (command: string, waitSeconds: number, pty = false) =>
  Effect.flatMap(served, (client) =>
    client["holder/start"]({ session, command, cwd: "/", pty, waitSeconds }),
  );

test("the buffer keeps the head and tail and marks what was dropped", () => {
  const buffer = makeOutputBuffer(10);
  buffer.append("abcde");
  expect(buffer.takeUnread()).toBe("abcde");
  buffer.append("fghijklmno");
  expect(buffer.takeUnread()).toBe("\n[5 characters of output were dropped here]\nklmno");
  expect(buffer.takeUnread()).toBe("");
});

effectTest(
  "a quick command exits within the start's wait with its output",
  Effect.gen(function* () {
    const result = yield* start("echo hi; exit 3", 5);

    expect(result.reason).toBe("exited");
    expect(result.output).toBe("hi\n");
    expect(result.process.state).toEqual(Exited.make({ code: 3 }));
  }).pipe(Effect.scoped, TestClock.withLive),
  base,
);

effectTest(
  "a long command keeps running, a wait ends on a matching line, and stop ends it",
  Effect.gen(function* () {
    const client = yield* served;
    const started = yield* start("echo booting; sleep 0.3; echo ready; sleep 60", 0.25);
    expect(Predicate.isTagged(started.process.state, "Running")).toBe(true);

    const waited = yield* client["holder/wait"]({
      session,
      id: started.process.id,
      pattern: "^ready$",
      quietSeconds: 30,
      deadlineSeconds: 10,
    });

    expect(waited.reason).toBe("matched");
    expect(waited.output).toContain("ready");

    const stopped = yield* client["holder/stop"]({ session, id: started.process.id });
    expect(stopped.state).toEqual(Stopped.make({}));
    expect(yield* client["holder/exits"]({ session })).toEqual([]);
  }).pipe(Effect.scoped, TestClock.withLive),
  base,
);

effectTest(
  "typing reaches a command on a terminal, and its exit is reported once",
  Effect.gen(function* () {
    const client = yield* served;
    const started = yield* start("read line; echo got $line", 0.25, true);
    const id = started.process.id;
    yield* client["holder/write"]({ session, id, text: "hello\n" });

    const waited = yield* client["holder/wait"]({
      session: "s2",
      id,
      quietSeconds: 30,
      deadlineSeconds: 10,
    }).pipe(Effect.flip);

    expect(Predicate.isTagged(waited, "UnknownProcess")).toBe(true);
    yield* Effect.sleep("500 millis");

    const exits = yield* client["holder/exits"]({ session });
    expect(exits.map(({ process }) => process.state)).toEqual([Exited.make({ code: 0 })]);
    expect(exits[0]?.tail).toContain("got hello");
    expect(yield* client["holder/exits"]({ session })).toEqual([]);
  }).pipe(Effect.scoped, TestClock.withLive),
  base,
);
