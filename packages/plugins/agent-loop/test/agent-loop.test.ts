/**
 * Turns on the scripted provider: tool steps, checkpoints, retries, cancel and answering tool calls
 * a restart left without results.
 */

import { expect } from "bun:test";

import { Duration, Effect, Exit, Fiber, Latch, Layer, Option, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";

import context from "@liminal/context";
import modelScripted from "@liminal/model-scripted";
import {
  reply,
  replyText,
  type Script,
  ScriptedModel,
  scriptedProvider,
} from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { defineTool, draft, type Entry, ModelError, type ModelPart, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import {
  SessionLog,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  userMessage,
} from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import toolPipeline from "@liminal/tool-pipeline";
import toolRegistry from "@liminal/tool-registry";
import { Tools } from "@liminal/tool-registry/contract";

import agentLoop from "../plugin.ts";
import {
  AfterFailure,
  AfterFailureHooks,
  AgentLoop,
  BeforeCall,
  BeforeCallHooks,
  StepOutcome,
  TurnEndingHooks,
} from "../src/contract.ts";

const stack = serverOf(agentLoop).pipe(
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(toolPipeline)),
  Layer.provideMerge(serverOf(toolRegistry)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

const settings = {
  model: { provider: scriptedProvider, id: "scripted" },
  thinking: "off",
} as const;

const call = (id: string, name: string, params: Schema.Json = {}): ModelPart => ({
  type: "tool-call",
  id,
  name,
  params,
  providerData: {},
});

const echo = defineTool({
  name: "echo",
  description: "Echoes text",
  parameters: Schema.Struct({ text: Schema.String }),
  runAlongside: true,
  safeToRerun: true,
  run: ({ text }) => Effect.succeed({ result: text }),
});

/** Starts a session with one user message and registers `echo`. */
const start = Effect.fn("start")(function* (text: string) {
  const log = yield* SessionLog;
  yield* log.create(s1);
  yield* log.append(s1, [userMessage(text)]);
  yield* (yield* Tools).register(echo);

  return log;
});

const kinds = (entries: ReadonlyArray<Entry>) => entries.map((entry) => entry.kind);

const resultsOf = (entries: ReadonlyArray<Entry>) =>
  entries.flatMap((entry) => (entry.kind === ToolResultEntry.kind ? [entry.data] : []));

/** The session's live slot now. */
const liveNow = (log: SessionLog["Service"]) =>
  log.watchLive(s1).pipe(Stream.runHead, Effect.map(Option.getOrUndefined), Effect.orDie);

/** Lets forked fibers run and the TestClock pass until `done` holds. */
const until = Effect.fn("until")(function* (done: Effect.Effect<boolean>) {
  for (let tries = 0; tries < 200; tries += 1) {
    if (yield* done) return true;
    yield* TestClock.adjust("10 millis");
  }

  return yield* Effect.die("the condition never held");
});

effectTest(
  "a turn runs tool steps until the model answers, each request seeing the results",
  Effect.gen(function* () {
    const log = yield* start("hello");
    const scripted = yield* ScriptedModel;

    yield* scripted.enqueue(
      reply([call("c1", "echo", { text: "one" }), call("c2", "missing")], { reason: "tool-calls" }),
      replyText("done"),
    );

    const end = yield* (yield* AgentLoop).run(s1, settings);
    expect(StepOutcome.$is("Answered")(end)).toBe(true);

    const entries = yield* log.read(s1, {});

    expect(kinds(entries)).toEqual([
      "session-log/user",
      "context/system",
      "session-log/tool-call",
      "session-log/tool-call",
      "session-log/tool-result",
      "session-log/tool-result",
      "session-log/text",
    ]);

    expect(resultsOf(entries)).toEqual([
      { callId: "c1", name: "echo", status: "done", result: "one" },
      { callId: "c2", name: "missing", status: "failed", result: "unknown tool: missing" },
    ]);

    const second = (yield* scripted.requests)[1];

    expect(second?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
      "tool",
      "tool",
    ]);

    expect(second?.cacheKey).toBe(s1);
  }),
  stack,
);

effectTest(
  "steering joins before the next call, a follow-up continues the turn, and a hook can end it",
  Effect.gen(function* () {
    const log = yield* start("hello");
    const scripted = yield* ScriptedModel;
    const steps: Array<string> = [];

    yield* (yield* BeforeCallHooks).register(
      () =>
        Effect.sync(() => {
          steps.push("before");
          if (steps.length === 2) return BeforeCall.Proceed({ input: [userMessage("steer")] });
          if (steps.length === 3) return BeforeCall.EndTurn({ reason: "enough" });

          return BeforeCall.Proceed({ input: [] });
        }),
      { order: 0 },
    );

    let followed = false;

    yield* (yield* TurnEndingHooks).register(
      () =>
        Effect.sync(() => {
          if (followed) return [];
          followed = true;

          return [userMessage("follow up")];
        }),
      { order: 0 },
    );

    yield* scripted.enqueue(reply([call("c1", "echo", { text: "one" })]), replyText("answer"));

    const end = yield* (yield* AgentLoop).run(s1, settings);
    expect(end).toEqual(StepOutcome.EndedByPlugin({ reason: "enough" }));

    const users = (yield* log.read(s1, {})).flatMap((entry) =>
      entry.kind === "session-log/user" ? [entry.text] : [],
    );

    expect(users).toEqual(["hello", "steer", "follow up"]);
    expect(yield* scripted.requests).toHaveLength(2);
  }),
  stack,
);

const rateLimit = new ModelError({ reason: "rate-limit", message: "slow down" });

const failing: Script = [
  { type: "event", event: { type: "start" } },
  { type: "event", event: { type: "part-start", index: 0, part: { type: "text" } } },
  { type: "event", event: { type: "delta", index: 0, text: "lost" } },
  { type: "fail", error: rateLimit },
];

effectTest(
  "a failed attempt is retried when a hook says so and saves nothing; without one the turn fails",
  Effect.gen(function* () {
    const log = yield* start("hello");
    const scripted = yield* ScriptedModel;
    const loop = yield* AgentLoop;

    yield* scripted.enqueue(failing, replyText("recovered"), failing);

    let retried = false;

    yield* (yield* AfterFailureHooks).register(
      (_turn, error, attempt) =>
        Effect.sync(() => {
          if (retried || attempt !== 1 || error.message !== "slow down")
            return AfterFailure.GiveUp();

          retried = true;

          return AfterFailure.Retry({ after: Duration.seconds(1) });
        }),
      { order: 0 },
    );

    const turn = yield* Effect.forkChild(loop.run(s1, settings));
    yield* until(Effect.map(liveNow(log), (live) => live?.kind === "agent-loop/retry"));
    yield* TestClock.adjust("1 second");
    yield* Fiber.join(turn);

    const texts = (yield* log.read(s1, {})).flatMap((entry) =>
      entry.kind === TextEntry.kind ? [entry.text] : [],
    );

    expect(texts).toEqual(["recovered"]);

    yield* log.append(s1, [userMessage("again")]);
    const before = (yield* log.read(s1, {})).length;
    const exit = yield* Effect.exit(loop.run(s1, settings));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(yield* log.read(s1, {})).toHaveLength(before);
    expect(yield* liveNow(log)).toBeUndefined();
  }),
  stack,
);

effectTest(
  "a cancel saves the partial reply marked interrupted",
  Effect.gen(function* () {
    const log = yield* start("hello");
    const scripted = yield* ScriptedModel;

    yield* scripted.enqueue([
      { type: "event", event: { type: "start" } },
      { type: "event", event: { type: "part-start", index: 0, part: { type: "text" } } },
      { type: "event", event: { type: "delta", index: 0, text: "partial" } },
      { type: "hang" },
    ]);

    const turn = yield* Effect.forkChild((yield* AgentLoop).run(s1, settings));

    yield* until(Effect.map(liveNow(log), (live) => live?.kind === "agent-loop/reply"));

    yield* Fiber.interrupt(turn);

    const last = (yield* log.read(s1, {})).at(-1);
    expect(last?.kind).toBe(TextEntry.kind);
    expect(last?.data).toEqual({ text: "partial", interrupted: true });
    expect(yield* liveNow(log)).toBeUndefined();
  }),
  stack,
);

effectTest(
  "a cancel during tool calls saves the calls that never finished as cancelled",
  Effect.gen(function* () {
    const log = yield* start("hello");
    const scripted = yield* ScriptedModel;
    const started = yield* Latch.make();

    yield* (yield* Tools).register(
      defineTool({
        name: "wait",
        description: "Waits forever",
        parameters: Schema.Struct({}),
        runAlongside: false,
        safeToRerun: false,
        run: () => Effect.andThen(started.open, Effect.never),
      }),
    );

    yield* scripted.enqueue(reply([call("c1", "echo", { text: "one" }), call("c2", "wait")]));

    const turn = yield* Effect.forkChild((yield* AgentLoop).run(s1, settings));
    yield* started.await;
    yield* Fiber.interrupt(turn);

    expect(resultsOf(yield* log.read(s1, {}))).toEqual([
      { callId: "c1", name: "echo", status: "done", result: "one" },
      { callId: "c2", name: "wait", status: "cancelled", result: "cancelled" },
    ]);
  }),
  stack,
);

/** A tool call entry saved before a restart. */
const saved = (id: string, name: string, params: Schema.Json) =>
  draft(ToolCallEntry, {
    data: { id, name, params },
    model: [{ role: "assistant", parts: [call(id, name, params)] }],
    text: name,
  });

effectTest(
  "tool calls a restart left without results rerun when safe and report interrupted otherwise",
  Effect.gen(function* () {
    const log = yield* start("hello");
    const scripted = yield* ScriptedModel;

    yield* (yield* Tools).register(
      defineTool({
        name: "write",
        description: "Not safe to rerun",
        parameters: Schema.Struct({}),
        runAlongside: false,
        safeToRerun: false,
        run: () => Effect.die("must not rerun"),
      }),
    );

    yield* log.append(s1, [saved("c1", "echo", { text: "again" }), saved("c2", "write", {})]);
    yield* scripted.enqueue(replyText("done"));

    yield* (yield* AgentLoop).run(s1, settings);

    expect(resultsOf(yield* log.read(s1, {}))).toEqual([
      { callId: "c2", name: "write", status: "interrupted", result: "interrupted by a restart" },
      { callId: "c1", name: "echo", status: "done", result: "again" },
    ]);
  }),
  stack,
);
