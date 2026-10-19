/**
 * Memory against real plugins and the scripted model: nudges at each stage, the forced check, the
 * `checkpoint` tool and the folded view, notes written in the background and the automatic
 * checkpoint once the cache is lost.
 */

import { expect, test } from "bun:test";

import {
  Context as EffectContext,
  Duration,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
  Ref,
  Schema,
  Stream,
} from "effect";
import { RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";

import agentLoop from "@liminal/agent-loop";
import { type BeforeCall, BeforeCallHooks } from "@liminal/agent-loop/contract";
import { CommandRunner } from "@liminal/command-runner/contract";
import context from "@liminal/context";
import { Context, MessageEntry } from "@liminal/context/contract";
import filesPlugin from "@liminal/files";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { reply, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import {
  defineTool,
  Directories,
  draft,
  type EntryDraft,
  type ModelRef,
  Pipeline,
  Seq,
  SessionId,
} from "@liminal/sdk";
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
import {
  type ToolCall,
  ToolChecks,
  ToolDecision,
  type ToolOutcome,
  Tools,
  ToolWrappers,
} from "@liminal/tools/contract";

import memory from "../plugin.ts";
import {
  CheckpointData,
  CheckpointEntry,
  RestoredEntry,
  MemoryRpcs,
  HandoffEntry,
  historyTool,
  type MemoryFile,
  NoteEntry,
  TouchedEntry,
} from "../src/contract.ts";
import { keptFound, mergeLists, mergeRanges } from "../src/server/files.ts";
import { rememberedFiles } from "../src/server/restore.ts";
import { statusPaths } from "../src/server/touched.ts";

/** What the stub `git status` prints, as `-z` output. */
class GitStatus extends EffectContext.Service<GitStatus, Ref.Ref<string>>()("test/GitStatus") {
  static readonly layer = Layer.effect(GitStatus, Ref.make(""));
}

/** A runner that only answers `git status`, from `GitStatus`. */
const stubRunner = Layer.effect(
  CommandRunner,
  Effect.gen(function* () {
    const status = yield* GitStatus;

    return CommandRunner.of({
      run: () =>
        Effect.map(Ref.get(status), (stdout) => ({
          end: { type: "exited", code: 0 },
          stdout,
          stderr: "",
        })),
    });
  }),
).pipe(Layer.provideMerge(GitStatus.layer));

const stack = serverOf(memory).pipe(
  Layer.provideMerge(serverOf(filesPlugin)),
  Layer.provideMerge(stubRunner),
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
const callCheckpoint = (params: { readonly [key: string]: Schema.Json }, callId = "k1") =>
  Effect.gen(function* () {
    const log = yield* SessionLog;

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

    yield* callCheckpoint({
      handoff: "Two of five files are done.",
      name: "Migrating five files to the new API",
    });

    const log = yield* SessionLog;

    expect((yield* log.list).map((session) => session.title)).toEqual([
      "Migrating five files to the new API",
    ]);

    expect(yield* requestTexts).toContain("Session name: Migrating five files to the new API");

    yield* callCheckpoint({ handoff: "Four of five files are done." }, "k2");

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
    yield* callCheckpoint({ handoff: "Two of five files are done." });

    const texts = yield* requestTexts;
    expect(texts.some((text) => text.startsWith("Session name:"))).toBe(false);
  }),
  stack,
);

effectTest(
  "a checkpoint folds the view to the handoff and what follows",
  Effect.gen(function* () {
    yield* start(said(300), userMessage("the early request"));
    yield* callCheckpoint({ handoff: "Two of five files are done." });
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

/** The scripted model's next reply submits a short-term memory with `summary`. */
const enqueueNote = (summary: string, files: Record<string, Schema.Json> = {}) =>
  Effect.flatMap(ScriptedModel, (scripted) =>
    scripted.enqueue(
      reply(
        [
          {
            type: "tool-call",
            id: "n1",
            name: "submit_short_term",
            params: { summary, ...files },
            providerData: {},
          },
        ],
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

/** Runs `next` as `call` in session `s1` through the registered wrappers. */
const wrapped = <R>(
  call: Omit<ToolCall, "sessionId">,
  next: Effect.Effect<ToolOutcome, never, R>,
) =>
  Effect.gen(function* () {
    const wrappers = yield* (yield* ToolWrappers).list;
    const services = yield* Effect.context<R>();

    return yield* Pipeline.run(wrappers, { call: { sessionId: s1, ...call }, tool: shell }, () =>
      Effect.provideContext(next, services),
    );
  });

const done: ToolOutcome = { status: "done", output: { result: "ok" } };

/** Writes `content` to `file` in the workspace. */
const writeFile = (file: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join((yield* Directories).workspace, file);
    yield* fs.makeDirectory(path.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, content);
  });

const decodeTouched = Schema.decodeUnknownOption(TouchedEntry.data);

/** Every saved `memory/touched` entry's data. */
const touched = Effect.map(
  Effect.flatMap(SessionLog, (log) => log.read(s1, {})),
  (entries) =>
    entries.flatMap((entry) =>
      entry.kind === TouchedEntry.kind ? Option.toArray(decodeTouched(entry.data)) : [],
    ),
);

effectTest(
  "the file wrapper records reads, edits, writes and shell changes, inner calls included",
  Effect.gen(function* () {
    yield* start();
    const status = yield* GitStatus;
    yield* writeFile("src/e.ts", "one\ntwo\n");
    yield* writeFile("src/dirty.ts", "before");
    yield* Ref.set(status, " M src/dirty.ts\0");

    yield* wrapped(
      { callId: "c1", name: "read", params: { path: "src/a.ts", offset: 10, limit: 5 } },
      Effect.succeed(done),
    );

    yield* wrapped(
      {
        callId: "c2",
        name: "edit",
        params: { path: "src/e.ts", oldText: "two", newText: "TWO\nthree" },
      },
      Effect.as(writeFile("src/e.ts", "one\nTWO\nthree\n").pipe(Effect.orDie), done),
    );

    yield* wrapped(
      { callId: "r1/0", outer: "r1", name: "write", params: { path: "src/w.ts", content: "" } },
      Effect.succeed(done),
    );

    const shellRun = Effect.gen(function* () {
      yield* writeFile("src/s.ts", "changed").pipe(Effect.orDie);
      yield* Ref.set(status, " M src/dirty.ts\0 M src/s.ts\0R  new.ts\0old.ts\0");
      yield* writeFile("new.ts", "moved").pipe(Effect.orDie);

      return done;
    });

    yield* wrapped(
      { callId: "c3", name: "shell", params: { command: "sed -i s/a/b/ src/s.ts" } },
      shellRun,
    );

    yield* wrapped(
      { callId: "c4", name: "read", params: { path: "src/failed.ts" } },
      Effect.succeed<ToolOutcome>({ status: "failed", message: "no such file" }),
    );

    yield* wrapped(
      { callId: "c5", name: "read", params: { path: "/elsewhere/x.ts" } },
      Effect.succeed(done),
    );

    expect(yield* touched).toEqual([
      {
        callId: "c1",
        files: [{ path: "src/a.ts", ranges: [{ from: 10, through: 14 }], edited: false }],
      },
      {
        callId: "c2",
        files: [{ path: "src/e.ts", ranges: [{ from: 2, through: 3 }], edited: true }],
      },
      { callId: "r1/0", files: [{ path: "src/w.ts", ranges: [], edited: true }] },
      {
        callId: "c3",
        files: [
          { path: "src/s.ts", ranges: [], edited: true },
          { path: "new.ts", ranges: [], edited: true },
        ],
      },
    ]);
  }),
  stack,
);

const touchedDraft = (files: ReadonlyArray<(typeof TouchedEntry.data.Type)["files"][number]>) =>
  draft(TouchedEntry, { data: { callId: "c1", files }, text: "" });

const found = (path: string) => ({ path, ranges: [], relevant: true, reason: "config" });

effectTest(
  "a short-term memory labels the files its range touched and keeps found files that exist and are named",
  Effect.gen(function* () {
    yield* writeFile("src/found.ts", "x");
    yield* writeFile("src/unnamed.ts", "x");

    yield* start(
      userMessage("ran cat src/found.ts src/ghost.ts"),
      touchedDraft([
        { path: "src/a.ts", ranges: [{ from: 1, through: 40 }], edited: false },
        { path: "src/b.ts", ranges: [], edited: true },
      ]),
      said(100),
      said(100),
    );

    yield* enqueueNote("Read two files.", {
      labels: [{ path: "src/b.ts", relevant: false, reason: "unrelated" }],
      found: [found("src/found.ts"), found("src/ghost.ts"), found("src/unnamed.ts")],
    });

    yield* beforeCall;
    yield* notesSaved(1);
    yield* callCheckpoint({ handoff: "Next: the tests." });

    const requested = yield* requestTexts;
    const texts = requested.join("\n");

    expect(requested).toContain('<reminder kind="files">\nsrc/found.ts\n\nx\n</reminder>');

    expect(texts).toContain(
      "Read two files.\n\nRelevant files:\n- src/a.ts (lines 1–40)\n- src/found.ts: config\n\nExplored, not relevant:\n- src/b.ts: unrelated",
    );

    expect(texts).not.toContain("ghost.ts:");
    expect(texts).not.toContain("unnamed");
  }),
  stack,
);

const file = (path: string, seq: number, fields: Partial<MemoryFile> = {}): MemoryFile => ({
  path,
  ranges: [],
  edited: false,
  relevant: true,
  reason: "",
  seq: Seq.make(seq),
  ...fields,
});

test("file lists merge by path: the newest label wins, lines join and edits stay", () => {
  const older = [
    file("a.ts", 1, { ranges: [{ from: 1, through: 10 }], edited: true, reason: "old" }),
    file("b.ts", 2),
  ];

  const newer = [
    file("a.ts", 5, { ranges: [{ from: 8, through: 20 }], relevant: false, reason: "done" }),
  ];

  expect(mergeLists([older, newer])).toEqual([
    file("a.ts", 5, {
      ranges: [{ from: 1, through: 20 }],
      edited: true,
      relevant: false,
      reason: "done",
    }),
    file("b.ts", 2),
  ]);

  expect(
    mergeRanges([
      { from: 30, through: 40 },
      { from: 1, through: 5 },
      { from: 6, through: 9 },
    ]),
  ).toEqual([
    { from: 1, through: 9 },
    { from: 30, through: 40 },
  ]);

  expect(
    keptFound(
      [{ path: "named.ts", ranges: [], relevant: true, reason: "" }],
      [],
      "cat other.ts",
      Seq.make(3),
    ),
  ).toEqual([]);

  expect(statusPaths(" M a.ts\0R  b.ts\0c.ts\0?? d e.ts\0")).toEqual(["a.ts", "b.ts", "d e.ts"]);
});

/** `count` lines of `width` characters, the first reading `l1`. */
const linesOf = (count: number, width = 4) =>
  Array.from({ length: count }, (_, index) => `l${index + 1}`.padEnd(width, ".")).join("\n");

effectTest(
  "a checkpoint reads back the model's files in order: short ones whole, long ones padded, the cap leaving out what does not fit",
  Effect.gen(function* () {
    yield* writeFile("small.ts", "one\ntwo");
    yield* writeFile("long.ts", linesOf(400));
    yield* writeFile("huge.ts", linesOf(300, 100));
    yield* writeFile("after.ts", "last");

    yield* start(said(100));
    yield* (yield* Settings).write("global", ["memory", "budget"], 10_000);

    yield* callCheckpoint({
      handoff: "Next: the tests.",
      files: [
        { path: "small.ts", ranges: [{ from: 1, through: 1 }] },
        {
          path: "long.ts",
          ranges: [
            { from: 130, through: 140 },
            { from: 100, through: 105 },
          ],
        },
        { path: "missing.ts" },
        { path: "huge.ts" },
        { path: "after.ts" },
      ],
    });

    const log = yield* (yield* SessionLog).read(s1, {});
    const checkpoint = log.find((entry) => entry.kind === CheckpointEntry.kind);

    const data = Option.flatMap(Option.fromUndefinedOr(checkpoint), (entry) =>
      decodeCheckpoint(entry.data),
    );

    expect(Option.map(data, ({ restored }) => restored)).toEqual(Option.some(3));
    expect(log.at(-2)?.kind).toBe(RestoredEntry.kind);

    const files = (yield* requestTexts).filter((text) =>
      text.startsWith('<reminder kind="files">'),
    );

    const window = linesOf(400).split("\n").slice(79, 160).join("\n");

    expect(files).toEqual([
      '<reminder kind="files">\nsmall.ts\n\none\ntwo\n</reminder>',
      `<reminder kind="files">\nlong.ts\n\n${window}\n[lines 80-160 of 400; read on from offset 161]\n</reminder>`,
      '<reminder kind="files">\nafter.ts\n\nlast\n</reminder>',
      '<reminder kind="files">\nRelevant files not read back, to stay within the context budget; read them when you need them:\n- huge.ts\n</reminder>',
    ]);

    expect(yield* requestTexts).toEqual(yield* requestTexts);
  }),
  stack,
);

const remembered = (files: ReadonlyArray<MemoryFile>) =>
  rememberedFiles(
    {
      notes: [
        {
          number: 1,
          session: s1,
          from: Seq.make(1),
          through: Seq.make(9),
          text: "",
          tokens: 0,
          files,
        },
      ],
      memories: [],
    },
    { shortTerm: [1] },
  ).map((each) => each.path);

test("a checkpoint without the model's list reads relevant files, edited first, then newest", () => {
  expect(
    remembered([
      file("old-read.ts", 2),
      file("new-read.ts", 8),
      file("old-edit.ts", 3, { edited: true }),
      file("skip.ts", 9, { relevant: false }),
      file("new-edit.ts", 5, { edited: true }),
    ]),
  ).toEqual(["new-edit.ts", "old-edit.ts", "new-read.ts", "old-read.ts"]);
});
