/** Attention: which events call for the sound, and which player plays it. */

import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

import { DateTime, Effect, Fiber, Layer, Option, Queue, Stream } from "effect";
import { RpcTest } from "effect/rpc";

import { type FollowEvent, SavedEvent, Seq, SessionId, Synced } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import { type InputWait, makeTuiInputWaits } from "@liminal/sdk/tui";
import { TurnEndedEntry, type TurnEndReason } from "@liminal/session-log/contract";
import settingsPlugin from "@liminal/settings";

import attention from "../plugin.ts";
import { AttentionRpcs } from "../src/contract.ts";
import { chimeWith, newWaits, turnEnds } from "../src/tui/chimes.ts";
import { playerOf } from "../src/tui/sound.ts";
import { DEFAULT_SOUND, SOUNDS, soundOf } from "../src/tui/sounds.ts";

const s1 = SessionId.make("s1");

const ended = (end: TurnEndReason): FollowEvent =>
  SavedEvent.make({
    entry: {
      sessionId: s1,
      seq: Seq.make(1),
      kind: TurnEndedEntry.kind,
      at: DateTime.makeUnsafe(0),
      data: { end },
      text: "",
      user: "hidden",
    },
  });

const ask = (id: string): InputWait => ({ id, sessionId: s1, source: "approval" });

effectTest(
  "a turn ending after the saved entries calls for the sound, unless it was cancelled",
  Effect.gen(function* () {
    const events = Stream.make(
      ended("answered"),
      Synced.make({}),
      ended("cancelled"),
      ended("ended-by-plugin"),
    );

    expect(yield* Stream.runCount(turnEnds(events))).toBe(1);
  }),
  Layer.empty,
);

effectTest(
  "a new pending ask calls for the sound; the same asks again do not",
  Effect.gen(function* () {
    const lists = Stream.make([], [ask("a")], [ask("a")], [ask("a"), ask("b")], []);

    expect(yield* Stream.runCount(newWaits(s1, lists))).toBe(2);
  }),
  Layer.empty,
);

effectTest(
  "wait identities include their source and session; removals are silent",
  Effect.gen(function* () {
    const approval = ask("same");
    const commit = { ...approval, source: "commit" };
    const elsewhere = { ...commit, sessionId: SessionId.make("s2") };

    const lists = Stream.make(
      [elsewhere],
      [approval],
      [approval, approval],
      [approval, commit],
      [commit],
      [],
      [commit],
    );

    expect(yield* Stream.runCount(newWaits(s1, lists))).toBe(3);
    expect(yield* Stream.runCount(newWaits(s1, Stream.make([commit])))).toBe(1);
  }),
  Layer.empty,
);

effectTest(
  "review and push waits each reach playback; a question turn adds just one sound",
  Effect.gen(function* () {
    const waits = yield* makeTuiInputWaits;
    const played = yield* Queue.unbounded<string>();

    const fiber = yield* chimeWith(s1, Stream.never, waits.changes, () =>
      Queue.offer(played, "sound").pipe(Effect.asVoid),
    ).pipe(Stream.runDrain, Effect.forkScoped);

    for (const id of ["review", "push"]) {
      yield* waits.waitForUser({ sessionId: s1, source: "commit", id }, Queue.take(played));
    }

    yield* Fiber.interrupt(fiber);
    expect(yield* Queue.size(played)).toBe(0);

    yield* chimeWith(s1, Stream.make(Synced.make({}), ended("ended-by-plugin")), Stream.empty, () =>
      Queue.offer(played, "sound").pipe(Effect.asVoid),
    ).pipe(Stream.runDrain);

    expect(yield* Queue.size(played)).toBe(1);
  }),
  Layer.empty,
);

const installed = (names: ReadonlyArray<string>) => (name: string) =>
  names.includes(name) ? `/usr/bin/${name}` : null;

test("the player is the first installed for the system", () => {
  expect(playerOf("darwin", installed(["afplay"]))).toEqual(Option.some("afplay"));
  expect(playerOf("linux", installed(["aplay", "pw-play"]))).toEqual(Option.some("pw-play"));
  expect(playerOf("linux", installed([]))).toEqual(Option.none());
  expect(playerOf("win32", installed(["afplay"]))).toEqual(Option.none());
});

const stack = serverOf(attention).pipe(
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

effectTest(
  "the choices are saved in the global settings and read back",
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(AttentionRpcs);

    expect(yield* client["attention/get"]()).toEqual({});

    yield* client["attention/set-enabled"]({ enabled: false });
    yield* client["attention/set-sound"]({ sound: "vesper" });
    expect(yield* client["attention/get"]()).toEqual({ enabled: false, sound: "vesper" });
  }),
  stack,
);

test("an unknown or missing sound id is the default sound", () => {
  expect(soundOf().id).toBe(DEFAULT_SOUND.id);
  expect(soundOf("nonesuch").id).toBe(DEFAULT_SOUND.id);
  expect(soundOf("lintel").id).toBe("lintel");
});

test("each sound has a unique id and an audio file", () => {
  expect(new Set(SOUNDS.map((sound) => sound.id)).size).toBe(SOUNDS.length);
  expect(SOUNDS.map((sound) => sound.id)).toContain(DEFAULT_SOUND.id);

  for (const sound of SOUNDS) expect(existsSync(sound.file)).toBe(true);
});
