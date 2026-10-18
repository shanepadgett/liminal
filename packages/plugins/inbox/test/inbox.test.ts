/** Sending on the scripted provider: an idle send starts a turn; a running one queues the input. */

import { expect } from "bun:test";

import { Effect, Latch, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";

import agentLoop from "@liminal/agent-loop";
import { TurnEndedEntry } from "@liminal/agent-loop/contract";
import context from "@liminal/context";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { replyText, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { type Entry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, UserEntry } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";
import toolPipeline from "@liminal/tool-pipeline";
import toolRegistry from "@liminal/tool-registry";

import inbox from "../plugin.ts";
import { Inbox, NoTurnSettings } from "../src/contract.ts";

const stack = serverOf(inbox).pipe(
  Layer.provideMerge(serverOf(agentLoop)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(toolPipeline)),
  Layer.provideMerge(serverOf(toolRegistry)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(modelCatalog)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

/** Creates the session and sets the scripted model as the default. */
const setUp = Effect.gen(function* () {
  yield* (yield* SessionLog).create(s1);

  yield* (yield* Settings).write("global", ["agent-loop", "model"], {
    provider: scriptedProvider,
    id: "scripted",
  });
});

/** The texts of the user messages and the turn ends, in order. */
const story = Effect.gen(function* () {
  const entries = yield* (yield* SessionLog).read(s1, {});

  return entries.flatMap((entry: Entry) => {
    if (entry.kind === UserEntry.kind) return [`user: ${entry.text}`];
    if (entry.kind === TurnEndedEntry.kind) return ["ended"];
    if (entry.kind === "session-log/text") return [`model: ${entry.text}`];

    return [];
  });
});

/** Advances the clock until `done` holds. */
const until = Effect.fn("until")(function* <E, R>(done: Effect.Effect<boolean, E, R>) {
  for (let tries = 0; tries < 200; tries += 1) {
    if (yield* done) return yield* Effect.void;
    yield* TestClock.adjust("10 millis");
  }

  return yield* Effect.die("the condition never held");
});

const endedTimes = (count: number) =>
  Effect.map(story, (lines) => lines.filter((line) => line === "ended").length >= count);

effectTest(
  "sending with no model set fails before saving anything",
  Effect.gen(function* () {
    yield* (yield* SessionLog).create(s1);
    const error = yield* Effect.flip((yield* Inbox).send(s1, "hi", "steer"));
    expect(error).toBeInstanceOf(NoTurnSettings);
    expect(yield* story).toEqual([]);
  }),
  stack,
);

effectTest(
  "input sent while a turn runs is queued, then continues the turn once its reply ends",
  Effect.gen(function* () {
    yield* setUp;
    const scripted = yield* ScriptedModel;
    const box = yield* Inbox;
    const first = yield* Latch.make();

    yield* scripted.enqueue([{ type: "gate", gate: first }, ...replyText("one")], replyText("two"));

    yield* box.send(s1, "go", "steer");
    // Lets the turn reach its first model call, held at the gate.
    yield* TestClock.adjust("50 millis");
    yield* box.send(s1, "later", "follow-up");
    yield* box.send(s1, "now", "steer");

    const queued = yield* box.queue(s1).pipe(Stream.runHead);
    expect(queued).toMatchObject({ value: { steers: ["now"], followUps: ["later"] } });

    yield* first.open;
    yield* until(endedTimes(1));

    expect(yield* story).toEqual([
      "user: go",
      "model: one",
      "user: now",
      "user: later",
      "model: two",
      "ended",
    ]);
  }),
  stack,
);

effectTest(
  "input sent after a turn ends starts the next turn",
  Effect.gen(function* () {
    yield* setUp;
    const scripted = yield* ScriptedModel;
    const box = yield* Inbox;

    yield* scripted.enqueue(replyText("one"), replyText("two"));
    yield* box.send(s1, "a", "steer");
    yield* until(endedTimes(1));
    yield* box.send(s1, "b", "follow-up");
    yield* until(endedTimes(2));

    expect(yield* story).toEqual([
      "user: a",
      "model: one",
      "ended",
      "user: b",
      "model: two",
      "ended",
    ]);
  }),
  stack,
);
