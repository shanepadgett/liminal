/**
 * Memory against real plugins and the scripted model: nudges at each stage, the forced check, the
 * `checkpoint` tool and the folded view, notes written in the background and the automatic
 * checkpoint once the cache is lost.
 */

import { expect } from "bun:test";

import { Duration, Effect, Fiber, Layer, Option, Predicate, Schema, Stream } from "effect";
import { RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";

import agentLoop from "@liminal/agent-loop";
import { type BeforeCall, BeforeCallHooks } from "@liminal/agent-loop/contract";
import context from "@liminal/context";
import { Context, MessageEntry } from "@liminal/context/contract";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { reply, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { defineTool, draft, type EntryDraft, type ModelRef, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import {
  SessionLog,
  TextEntry,
  ToolCallEntry,
  ToolResultEntry,
  TurnStartedEntry,
  userMessage,
} from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";
import tools from "@liminal/tools";
import { ToolChecks, ToolDecision, Tools } from "@liminal/tools/contract";

import memory from "../plugin.ts";
import {
  CheckpointData,
  CheckpointEntry,
  MemoryRpcs,
  HandoffEntry,
  historyTool,
  NoteEntry,
} from "../src/contract.ts";

const stack = serverOf(memory).pipe(
  Layer.provideMerge(serverOf(agentLoop)),
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(modelCatalog)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");
const model: ModelRef = { provider: scriptedProvider, id: "scripted" };

/** 1,000 tokens: 500 is the notice stage, 750 the warning, 1,000 forced. */
const BUDGET = 1000;

/** A user message of about `tokens` tokens. */
const said = (tokens: number) => userMessage("x".repeat(tokens * 4));

const turnStarted = draft(TurnStartedEntry, { data: { model }, text: "" });

const start = (...drafts: ReadonlyArray<EntryDraft>) =>
  Effect.gen(function* () {
    yield* (yield* Settings).write("global", ["memory", "budget"], BUDGET);
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, [turnStarted, ...drafts]);
  });

/** Every hook's input before a model call. */
const beforeCall = Effect.gen(function* () {
  const hooks = yield* (yield* BeforeCallHooks).list;

  const answers: ReadonlyArray<BeforeCall> = yield* Effect.forEach(hooks, (hook) =>
    hook({ sessionId: s1, settings: { model } }),
  );

  return answers.flatMap((answer) => (Predicate.isTagged(answer, "Proceed") ? answer.input : []));
});

const decodeMessage = Schema.decodeUnknownOption(MessageEntry.data);

const nudgeTexts = (input: ReadonlyArray<EntryDraft>) =>
  input.flatMap((each) =>
    Option.match(decodeMessage(each.data), {
      onNone: () => [],
      onSome: ({ label, text }) => (label === "memory" ? [text] : []),
    }),
  );

const shell = defineTool({
  name: "shell",
  description: "Runs a command line",
  parameters: Schema.Struct({ command: Schema.String }),
  runAlongside: false,
  safeToRerun: false,
  run: () => Effect.succeed({ result: "ran" }),
});

/** The first answer of the registered checks that is not Allow. */
const check = (name: string) =>
  Effect.gen(function* () {
    const tool = name === "shell" ? shell : yield* toolNamed(name);
    const checks = yield* (yield* ToolChecks).list;

    const decisions = yield* Effect.forEach(checks, (each) =>
      each({ sessionId: s1, callId: "c1", name, params: {} }, tool),
    );

    return decisions.find((decision) => !Predicate.isTagged(decision, "Allow"));
  });

const toolNamed = (name: string) =>
  Effect.flatMap(
    Effect.flatMap(Tools, (registry) => registry.get(name)),
    Effect.fromOption,
  );

/** A saved `checkpoint` call and its done result, around the tool's own run. */
const callCheckpoint = (handoff: string, name?: string, callId = "k1") =>
  Effect.gen(function* () {
    const log = yield* SessionLog;
    const params = name === undefined ? { handoff } : { handoff, name };

    yield* log.append(s1, [
      draft(ToolCallEntry, {
        data: { id: callId, name: "checkpoint", params },
        model: [
          {
            role: "assistant",
            parts: [
              { type: "tool-call", id: callId, name: "checkpoint", params, providerData: {} },
            ],
          },
        ],
        text: "",
      }),
    ]);

    const tool = yield* toolNamed("checkpoint");
    const output = yield* tool.run(params, { sessionId: s1, callId });

    yield* log.append(s1, [
      draft(ToolResultEntry, {
        data: { callId, name: "checkpoint", status: "done", result: output.result },
        model: [
          {
            role: "user",
            parts: [
              {
                type: "tool-result",
                callId,
                name: "checkpoint",
                result: output.result,
                isFailure: false,
              },
            ],
          },
        ],
        text: "",
      }),
    ]);
  });

/** Every text the next request sends. */
const requestTexts = Effect.gen(function* () {
  const request = yield* (yield* Context).preview(s1, model);

  return request.messages.flatMap((message) =>
    message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
  );
});

effectTest(
  "a nudge is sent once when a stage is crossed",
  Effect.gen(function* () {
    yield* start(said(600));

    const first = yield* beforeCall;
    expect(nudgeTexts(first)).toHaveLength(1);
    expect(nudgeTexts(first)[0]).toContain("half full");

    yield* (yield* SessionLog).append(s1, [first[0] ?? said(1)]);
    expect(nudgeTexts(yield* beforeCall)).toEqual([]);

    yield* (yield* SessionLog).append(s1, [said(200)]);
    expect(nudgeTexts(yield* beforeCall)[0]).toContain("three quarters full");
  }),
  stack,
);

effectTest(
  "a full context denies every tool but checkpoint",
  Effect.gen(function* () {
    yield* start(said(1100));

    const denied = yield* check("shell");

    expect(denied).toEqual(
      ToolDecision.Deny({ reason: "Context is full. Call checkpoint first." }),
    );

    expect(yield* check("checkpoint")).toBeUndefined();
  }),
  stack,
);

effectTest(
  "a checkpoint with a name renames the session and the folded view shows the name",
  Effect.gen(function* () {
    yield* start(said(300), userMessage("the early request"));
    yield* callCheckpoint("Two of five files are done.", "Migrating five files to the new API");

    const log = yield* SessionLog;

    expect((yield* log.list).map((session) => session.title)).toEqual([
      "Migrating five files to the new API",
    ]);

    expect(yield* requestTexts).toContain("Session name: Migrating five files to the new API");

    yield* callCheckpoint("Four of five files are done.", undefined, "k2");

    expect((yield* log.list).map((session) => session.title)).toEqual([
      "Migrating five files to the new API",
    ]);

    expect(yield* requestTexts).toContain("Session name: Migrating five files to the new API");
  }),
  stack,
);

effectTest(
  "a checkpoint without a name adds no name line",
  Effect.gen(function* () {
    yield* start(said(300), userMessage("the early request"));
    yield* callCheckpoint("Two of five files are done.");

    const texts = yield* requestTexts;
    expect(texts.some((text) => text.startsWith("Session name:"))).toBe(false);
  }),
  stack,
);

effectTest(
  "a checkpoint folds the view to the handoff and what follows",
  Effect.gen(function* () {
    yield* start(said(300), userMessage("the early request"));
    yield* callCheckpoint("Two of five files are done.");
    yield* (yield* SessionLog).append(s1, [userMessage("what is next?")]);

    const log = yield* (yield* SessionLog).read(s1, {});
    expect(log.some((entry) => entry.kind === CheckpointEntry.kind)).toBe(true);
    expect(log.some((entry) => entry.kind === HandoffEntry.kind)).toBe(true);

    const texts = yield* requestTexts;
    expect(texts.some((text) => text.includes("Two of five files are done."))).toBe(true);
    expect(texts).toContain("what is next?");
    expect(texts).toContain("the early request");
  }),
  stack,
);

effectTest(
  "checkpoint fails when called with other tools",
  Effect.gen(function* () {
    yield* start();
    const log = yield* SessionLog;

    yield* log.append(s1, [
      draft(ToolCallEntry, {
        data: { id: "a1", name: "shell", params: {} },
        model: [
          {
            role: "assistant",
            parts: [{ type: "tool-call", id: "a1", name: "shell", params: {}, providerData: {} }],
          },
        ],
        text: "",
      }),
      draft(ToolCallEntry, {
        data: { id: "k1", name: "checkpoint", params: {} },
        model: [
          {
            role: "assistant",
            parts: [
              { type: "tool-call", id: "k1", name: "checkpoint", params: {}, providerData: {} },
            ],
          },
        ],
        text: "",
      }),
    ]);

    const tool = yield* toolNamed("checkpoint");
    const failed = yield* Effect.flip(tool.run({ handoff: "h" }, { sessionId: s1, callId: "k1" }));
    expect(failed.message).toBe("Call checkpoint alone, without other tool calls.");
  }),
  stack,
);

/** The scripted model's next reply submits `note`. */
const enqueueNote = (note: string) =>
  Effect.flatMap(ScriptedModel, (scripted) =>
    scripted.enqueue(
      reply(
        [{ type: "tool-call", id: "n1", name: "submit_note", params: { note }, providerData: {} }],
        { reason: "tool-calls" },
      ),
    ),
  );

/** Waits for `count` note entries. */
const notesSaved = (count: number) =>
  Effect.flatMap(SessionLog, (log) =>
    log.subscribe(s1, {}).pipe(
      Stream.filter((item) => "kind" in item && item.kind === NoteEntry.kind),
      Stream.take(count),
      Stream.runDrain,
    ),
  );

const decodeCheckpoint = Schema.decodeUnknownOption(CheckpointData);

effectTest(
  "notes are written in the background and an idle session checkpoints automatically",
  Effect.gen(function* () {
    yield* start(said(200), said(200), said(200));
    yield* enqueueNote("The user asked for three things.");
    yield* enqueueNote("The second request.");
    yield* enqueueNote("The third request.");

    yield* beforeCall;
    yield* notesSaved(3);

    yield* (yield* SessionLog).append(s1, [
      draft(TextEntry, {
        data: {
          text: "done",
          interrupted: false,
          finish: {
            reason: "stop",
            usage: { input: 700, output: 10, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
          },
        },
        model: [{ role: "assistant", parts: [{ type: "text", text: "done", providerData: {} }] }],
        text: "done",
      }),
    ]);

    yield* TestClock.adjust(Duration.minutes(6));
    yield* beforeCall;

    const log = yield* (yield* SessionLog).read(s1, {});
    const saved = log.find((entry) => entry.kind === CheckpointEntry.kind);

    const data = Option.flatMap(Option.fromUndefinedOr(saved), (entry) =>
      decodeCheckpoint(entry.data),
    );

    expect(Option.exists(data, ({ trigger }) => Predicate.isTagged(trigger, "Idle"))).toBe(true);
    expect(Option.map(data, ({ shortTerm }) => shortTerm.length)).toEqual(Option.some(3));

    const texts = yield* requestTexts;
    expect(texts.some((text) => text.includes("The user asked for three things."))).toBe(true);
  }),
  stack,
);

effectTest(
  "the first note is written once one note's range of history exists",
  Effect.gen(function* () {
    yield* start(said(130));
    yield* enqueueNote("The user's first request.");

    yield* beforeCall;
    yield* notesSaved(1);
  }),
  stack,
);

effectTest(
  "history reads an entry range back as a transcript and refuses a range that runs backwards",
  Effect.gen(function* () {
    yield* start(userMessage("first ask"), userMessage("second ask"), userMessage("third ask"));
    const history = yield* toolNamed(historyTool);
    const callContext = { sessionId: s1, callId: "h1" };

    const { result } = yield* history.run({ from: 2, through: 3 }, callContext);
    expect(result).toBe("#2 user: first ask\n\n#3 user: second ask");

    const failed = yield* Effect.flip(history.run({ from: 3, through: 2 }, callContext));
    expect(failed.message).toContain("through");
  }),
  stack,
);

effectTest(
  "the status streams the size against the budget once the log settles",
  Effect.gen(function* () {
    yield* start(said(600));
    const client = yield* RpcTest.makeClient(MemoryRpcs);

    const first = yield* client["memory/status"]({ session: s1 }).pipe(
      Stream.runHead,
      Effect.forkChild,
    );

    yield* TestClock.adjust(Duration.seconds(1));

    const status = Option.getOrThrow(yield* Fiber.join(first));
    expect(status.budget).toBe(BUDGET);
    expect(status.stage).toBe("notice");
    expect(status.checkpoints).toBe(0);
    expect(status.notesThrough).toBeUndefined();
  }),
  stack,
);
