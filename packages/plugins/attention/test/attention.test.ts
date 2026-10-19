/** Attention: which events call for the sound, and which player plays it. */

import { expect, test } from "bun:test";

import { DateTime, Effect, Layer, Option, Stream } from "effect";

import type { PendingAsk } from "@liminal/approval/contract";
import { type FollowEvent, SavedEvent, Seq, SessionId, Synced } from "@liminal/sdk";
import { effectTest } from "@liminal/sdk/testing";
import { TurnEndedEntry, type TurnEndReason } from "@liminal/session-log/contract";

import { newAsks, turnEnds } from "../src/tui/chimes.ts";
import { playerOf } from "../src/tui/sound.ts";

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

const ask = (id: string): PendingAsk => ({
  id,
  sessionId: s1,
  callId: id,
  tool: "shell",
  params: {},
  reason: "",
});

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

    expect(yield* Stream.runCount(newAsks(lists))).toBe(2);
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
