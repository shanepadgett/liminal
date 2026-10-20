/**
 * Approval through the real tool pipeline: the safe list, the decision model, the reviewer, the
 * user's answer, `askCommands`, the session modes, writes outside the workspace and withdrawn
 * asks.
 */

import { expect } from "bun:test";

import { Effect, Fiber, Layer, Option, Schema, Stream } from "effect";

import commandRunner from "@liminal/command-runner";
import context from "@liminal/context";
import decisions from "@liminal/decisions";
import { DecisionModels } from "@liminal/decisions/contract";
import files from "@liminal/files";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { reply, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import {
  type Answer,
  BoolAnswer,
  ChoiceAnswer,
  defineTool,
  draft,
  type Entry,
  SessionId,
  type Tool,
} from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, TurnStartedEntry, userMessage } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";
import shellSafety from "@liminal/shell-safety";
import tools from "@liminal/tools";
import { ToolPipeline } from "@liminal/tools/contract";

import approval from "../plugin.ts";
import {
  Approval,
  ApprovalEntry,
  type ApprovalRecord,
  ModeEntry,
  type PendingAsk,
} from "../src/contract.ts";
import { makeModes } from "../src/server/modes.ts";

const stack = serverOf(approval).pipe(
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(shellSafety)),
  Layer.provideMerge(serverOf(decisions)),
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(modelCatalog)),
  Layer.provideMerge(serverOf(files)),
  Layer.provideMerge(serverOf(commandRunner)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

const shell = defineTool({
  name: "shell",
  description: "Runs a command line",
  parameters: Schema.Struct({ command: Schema.String }),
  runAlongside: false,
  safeToRerun: false,
  run: ({ command }) => Effect.succeed({ result: `ran ${command}` }),
});

const write = defineTool({
  name: "write",
  description: "Writes a file",
  parameters: Schema.Struct({ path: Schema.String, content: Schema.String }),
  runAlongside: false,
  safeToRerun: true,
  run: ({ path }) => Effect.succeed({ result: `wrote ${path}` }),
});

/** A session whose newest turn runs on the scripted provider, so the reviewer uses it. */
const start = Effect.gen(function* () {
  const log = yield* SessionLog;
  yield* log.create(s1);

  yield* log.append(s1, [
    userMessage("clean up the build output"),
    draft(TurnStartedEntry, {
      data: { model: { provider: scriptedProvider, id: "scripted" }, thinking: "off" },
      text: "",
    }),
  ]);
});

const runCall = (tool: Tool, params: Schema.Json) =>
  Effect.flatMap(ToolPipeline, (pipeline) =>
    pipeline.run({ sessionId: s1, callId: "c1", name: tool.spec.name, params }, Option.some(tool)),
  );

const approving: Readonly<Record<string, Answer>> = {
  hidden: BoolAnswer.make({ probability: 0.05 }),
  impact: ChoiceAnswer.make({
    choice: "workspace",
    probabilities: { none: 0.1, workspace: 0.85, user_home: 0.05 },
    confidence: 0.9,
  }),
  intent: BoolAnswer.make({ probability: 0.9 }),
};

/** A decision model that approves every call. */
const registerDecisionModel = Effect.flatMap(DecisionModels, (registry) =>
  registry.register({
    id: "test/jev",
    family: "jev",
    available: Effect.succeed(true),
    classify: () => Effect.succeed(approving),
  }),
);

/** The scripted model's next reply submits this review. */
const enqueueReview = (decision: "approved" | "ask", summary: string) =>
  Effect.flatMap(ScriptedModel, (scripted) =>
    scripted.enqueue(
      reply(
        [
          {
            type: "tool-call",
            id: "r1",
            name: "submit_review",
            params: {
              risk: decision === "approved" ? "none" : "reaches_past_task",
              summary,
              reason: `review: ${decision}`,
            },
            providerData: {},
          },
        ],
        { reason: "tool-calls" },
      ),
    ),
  );

/** The first non-empty list of the session's waiting asks. */
const waitingAsks = Effect.flatMap(Approval, (service) =>
  service.pending(s1).pipe(
    Stream.filter((asks) => asks.length > 0),
    Stream.runHead,
    Effect.map((found) => Option.getOrElse(found, (): ReadonlyArray<PendingAsk> => [])),
  ),
);

const decodeRecord = Schema.decodeUnknownSync(ApprovalEntry.data);

const savedAnswers = Effect.flatMap(SessionLog, (log) =>
  log
    .read(s1, {})
    .pipe(
      Effect.map((entries: ReadonlyArray<Entry>) =>
        entries.flatMap((entry): ReadonlyArray<ApprovalRecord> =>
          entry.kind === ApprovalEntry.kind ? [decodeRecord(entry.data)] : [],
        ),
      ),
    ),
);

const modelCalls = Effect.flatMap(ScriptedModel, (scripted) =>
  Effect.map(scripted.requests, (requests) => requests.length),
);

effectTest(
  "safe commands run without asking anyone",
  Effect.gen(function* () {
    yield* start;

    expect(yield* runCall(shell, { command: "ls -la" })).toEqual({
      status: "done",
      output: { result: "ran ls -la" },
    });

    expect(yield* modelCalls).toBe(0);
    expect(yield* savedAnswers).toEqual([]);
  }),
  stack,
);

effectTest(
  "the decision model approves before the reviewer is asked",
  Effect.gen(function* () {
    yield* start;
    yield* registerDecisionModel;

    expect((yield* runCall(shell, { command: "rm -rf build" })).status).toBe("done");
    expect(yield* modelCalls).toBe(0);

    expect((yield* savedAnswers).map((record) => [record.by, record.model])).toEqual([
      ["decision-model", "test/jev"],
    ]);
  }),
  stack,
);

effectTest(
  "without a decision model the reviewer approves",
  Effect.gen(function* () {
    yield* start;
    yield* enqueueReview("approved", "Deletes the build folder");

    expect((yield* runCall(shell, { command: "rm -rf build" })).status).toBe("done");
    expect(yield* modelCalls).toBe(1);

    expect((yield* savedAnswers).map((record) => [record.by, record.summary])).toEqual([
      ["reviewer", "Deletes the build folder"],
    ]);
  }),
  stack,
);

effectTest(
  "a reviewer that asks shows its summary, and the user's note reaches the model",
  Effect.gen(function* () {
    yield* start;
    yield* enqueueReview("ask", "Deletes your home folder");

    const running = yield* Effect.forkChild(runCall(shell, { command: "rm -rf ~" }));
    const [ask] = yield* waitingAsks;

    expect(ask?.summary).toBe("Deletes your home folder");
    expect(ask?.reason).toBe("the command is not on the safe list");

    yield* (yield* Approval).answer(ask?.id ?? "", false, "never touch home");

    expect(yield* Fiber.join(running)).toEqual({
      status: "denied",
      message: "the user rejected the call: never touch home",
    });

    expect((yield* savedAnswers).map((record) => [record.by, record.approved])).toEqual([
      ["user", false],
    ]);

    expect((yield* savedAnswers).map((record) => [record.summary, record.reviewed])).toEqual([
      ["Deletes your home folder", { risk: "reaches_past_task", reason: "review: ask" }],
    ]);
  }),
  stack,
);

effectTest(
  "askCommands go to the user even when a model would approve",
  Effect.gen(function* () {
    yield* start;
    yield* registerDecisionModel;
    yield* (yield* Settings).write("global", ["approval", "askCommands"], ["git push"]);
    yield* enqueueReview("approved", "Pushes main to origin");

    const running = yield* Effect.forkChild(runCall(shell, { command: "git push origin main" }));
    const [ask] = yield* waitingAsks;

    expect(ask?.reason).toBe("the command matches askCommands");
    expect(ask?.summary).toBe("Pushes main to origin");

    yield* (yield* Approval).answer(ask?.id ?? "", true, "");

    expect((yield* Fiber.join(running)).status).toBe("done");
  }),
  stack,
);

effectTest(
  "full mode runs every call, and the session mode shows over the settings' mode",
  Effect.gen(function* () {
    yield* start;
    const service = yield* Approval;

    const modeNow = service.mode(s1).pipe(Stream.runHead, Effect.map(Option.getOrUndefined));
    expect(yield* modeNow).toBe("auto");

    yield* service.setMode(s1, "full");
    expect(yield* modeNow).toBe("full");

    expect((yield* runCall(shell, { command: "rm -rf build" })).status).toBe("done");
    expect(yield* modelCalls).toBe(0);
  }),
  stack,
);

const savedModes = Effect.flatMap(SessionLog, (log) =>
  log
    .read(s1, {})
    .pipe(
      Effect.map((entries: ReadonlyArray<Entry>) =>
        entries.flatMap((entry) => (entry.kind === ModeEntry.kind ? [entry.data] : [])),
      ),
    ),
);

effectTest(
  "a set mode is saved in the session, and a server with no memory of it reads it back",
  Effect.gen(function* () {
    yield* start;
    const service = yield* Approval;

    yield* service.setMode(s1, "ask");
    expect(yield* savedModes).toEqual([{ mode: "ask" }]);

    // What a restarted server sees: no memory of the session, only the log.
    yield* (yield* SessionLog).append(s1, [
      draft(ModeEntry, { data: { mode: "full" }, text: "Approval mode: full" }),
    ]);

    const fresh = yield* makeModes(yield* Settings, yield* SessionLog);

    expect(yield* fresh.get(s1)).toBe("full");
  }),
  stack,
);

effectTest(
  "a mode set before the session exists is saved once it does",
  Effect.gen(function* () {
    const service = yield* Approval;
    yield* service.setMode(s1, "full");

    yield* start;
    expect(yield* savedModes).toEqual([]);

    const fresh = yield* makeModes(yield* Settings, yield* SessionLog);
    expect(yield* fresh.get(s1)).toBe("auto");

    expect((yield* runCall(shell, { command: "rm -rf build" })).status).toBe("done");
    expect(yield* savedModes).toEqual([{ mode: "full" }]);
    expect(yield* fresh.get(s1)).toBe("full");
  }),
  stack,
);

effectTest(
  "a write outside the workspace asks, and interrupting the call withdraws the ask",
  Effect.gen(function* () {
    yield* start;
    yield* (yield* Approval).setMode(s1, "ask");

    expect((yield* runCall(write, { path: "notes.md", content: "x" })).status).toBe("done");
    yield* enqueueReview("ask", "Overwrites the hosts file");

    const running = yield* Effect.forkChild(runCall(write, { path: "/etc/hosts", content: "x" }));

    const [ask] = yield* waitingAsks;

    expect(ask?.reason).toBe("it changes /etc/hosts, outside the workspace");

    yield* Fiber.interrupt(running);

    const left = yield* (yield* Approval)
      .pending(s1)
      .pipe(Stream.runHead, Effect.map(Option.getOrUndefined));

    expect(left).toEqual([]);
  }),
  stack,
);
