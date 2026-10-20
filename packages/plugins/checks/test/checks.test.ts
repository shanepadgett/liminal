/**
 * Checks in a git workspace: a writing call saves its changes and runs the fixers; the turn's end
 * runs the checks and sends failures back; the `checks` tool follows the checks file and trust.
 */

import { expect, test } from "bun:test";

import { Duration, Effect, FileSystem, Layer, Option, Path, Predicate } from "effect";

import { BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import commandRunner from "@liminal/command-runner";
import { CommandRunner } from "@liminal/command-runner/contract";
import {
  defaultHints,
  Directories,
  draft,
  KeyedRegistry,
  Pipeline,
  ProjectTrust,
  Registry,
  SessionId,
  type Tool,
} from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, TurnStartedEntry } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import toolOutput from "@liminal/tool-output";
import { type ToolOutcome, Tools, ToolWrappers } from "@liminal/tools/contract";

import checks from "../plugin.ts";
import {
  ChangesEntry,
  checksTool,
  CommitChecks,
  FixedEntry,
  ReportEntry,
} from "../src/contract.ts";
import { workspacePaths } from "../src/server/snapshot.ts";

const stack = serverOf(checks).pipe(
  Layer.provideMerge(serverOf(toolOutput)),
  Layer.provideMerge(serverOf(commandRunner)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(
    Layer.mergeAll(
      Registry.layer(ToolWrappers),
      Registry.layer(BeforeCallHooks),
      Registry.layer(TurnEndingHooks),
      KeyedRegistry.layer(Tools, (tool) => tool.spec.name),
    ),
  ),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

/** Fixes `a.txt` by upper-casing it; the check fails while any file says `bad`. */
const checksFile = {
  fix: [
    {
      name: "upper",
      command: 'for f in {files}; do tr a-z A-Z < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; done',
      include: ["*.txt"],
    },
  ],
  check: [
    { name: "clean", command: "! grep -ri bad *.txt", details: "no bad words", include: ["*.txt"] },
  ],
};

const writer: Tool = {
  spec: { name: "write", description: "", parameters: {} },
  offer: "start",
  guidance: [],
  hints: defaultHints,
  runAlongside: false,
  safeToRerun: false,
  run: () => Effect.succeed({ result: "" }),
};

/** A git workspace, trusted, with the checks file, and a session whose turn has started. */
const setUp = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace, project } = yield* Directories;

  yield* (yield* CommandRunner).run({
    command: "git init -q",
    cwd: workspace,
    timeout: Duration.seconds(5),
  });

  yield* fs.writeFileString(path.join(project, "checks.json"), JSON.stringify(checksFile));
  yield* (yield* ProjectTrust).trust;

  const log = yield* SessionLog;
  yield* log.create(s1);
  const model = { provider: "p", id: "m" };
  yield* log.append(s1, [draft(TurnStartedEntry, { data: { model }, text: "" })]);
});

/** Runs a call through the wrappers that writes `text` to `file` in the workspace. */
const writeThrough = (file: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { workspace } = yield* Directories;
    const wrappers = yield* (yield* ToolWrappers).list;
    const call = { sessionId: s1, callId: file, name: "write", params: {} };
    const write = fs.writeFileString(path.join(workspace, file), text).pipe(Effect.orDie);

    const ran: Effect.Effect<ToolOutcome> = Effect.as(write, {
      status: "done",
      output: { result: "" },
    });

    return yield* Pipeline.run(wrappers, { call, tool: writer }, () => ran);
  });

const kinds = (entries: ReadonlyArray<{ readonly kind: string }>) =>
  entries.map(({ kind }) => kind);

const settle = Effect.gen(function* () {
  const hooks = yield* (yield* TurnEndingHooks).list;
  const model = { provider: "p", id: "m" };

  const drafts = yield* Effect.forEach(hooks, (hook) =>
    hook({ sessionId: s1, settings: { model } }),
  );

  return drafts.flat();
});

test("workspace paths drop the prefix and read renames", () => {
  const output = "pkg/\nM  pkg/a.ts\0R  pkg/b.ts\0pkg/old.ts\0?? other/c.ts\0";
  expect(workspacePaths(output)).toEqual(["a.ts", "b.ts", "old.ts"]);
});

effectTest(
  "a writing call saves its changes and the fixers run on them",
  Effect.gen(function* () {
    yield* setUp;
    yield* writeThrough("a.txt", "hello\n");

    const entries = yield* (yield* SessionLog).read(s1, {});
    expect(kinds(entries)).toEqual([TurnStartedEntry.kind, FixedEntry.kind, ChangesEntry.kind]);
    expect(entries[2]?.data).toEqual({ type: "files", paths: ["a.txt"] });

    const fs = yield* FileSystem.FileSystem;
    const { workspace } = yield* Directories;
    expect(yield* fs.readFileString(`${workspace}/a.txt`)).toBe("HELLO\n");
  }),
  stack,
);

effectTest(
  "a failing check goes back to the model, then ends the turn after three tries",
  Effect.gen(function* () {
    yield* setUp;
    yield* writeThrough("b.md", "bad\n");
    yield* writeThrough("a.txt", "bad\n");

    const first = yield* settle;
    expect(kinds(first.map(({ entry }) => entry))).toEqual([ReportEntry.kind]);
    expect(first[0]?.data).toMatchObject({ passed: [], failed: [{ name: "clean" }] });

    const [report] = first;
    if (report === undefined) return yield* Effect.die("no report");

    const log = yield* SessionLog;

    for (const round of [1, 2, 3]) {
      yield* log.append(s1, [report]);
      yield* writeThrough("a.txt", `bad ${round}\n`);
    }

    expect(yield* settle).toEqual([]);
    const reports = (yield* log.read(s1, {})).filter(({ kind }) => kind === ReportEntry.kind);
    expect(reports).toHaveLength(4);

    return reports.length;
  }),
  stack,
);

effectTest(
  "passing checks save their report and end the turn; nothing is due after",
  Effect.gen(function* () {
    yield* setUp;
    yield* writeThrough("a.txt", "good\n");

    expect(yield* settle).toEqual([]);
    const entries = yield* (yield* SessionLog).read(s1, {});
    expect(entries.at(-1)?.text).toBe("Checks passed");
    expect(yield* settle).toEqual([]);
  }),
  stack,
);

const toolNames = Effect.map(
  Effect.flatMap(Tools, (tools) => tools.list),
  (all) => all.map(({ spec }) => spec.name),
);

const beforeCall = Effect.gen(function* () {
  const hooks = yield* (yield* BeforeCallHooks).list;
  const model = { provider: "p", id: "m" };

  const answers = yield* Effect.forEach(hooks, (hook) =>
    hook({ sessionId: s1, settings: { model } }),
  );

  expect(answers.every((answer) => Predicate.isTagged(answer, "Proceed"))).toBe(true);
});

effectTest(
  "the checks tool follows the checks file and runs the due checks",
  Effect.gen(function* () {
    expect(yield* toolNames).toEqual([]);
    yield* setUp;
    yield* beforeCall;
    expect(yield* toolNames).toEqual([checksTool]);

    const tool = Option.getOrThrow(yield* (yield* Tools).get(checksTool));
    expect(tool.spec.parameters).toMatchObject({ type: "object" });
    expect(tool.spec.description).toContain("- clean: no bad words");
    expect(tool.spec.description).toContain("only way to run checks, period");
    expect(tool.spec.description).toContain("Never run one any other way");
    expect(tool.guidance.join("\n")).toContain("add it to the checks file");

    expect(yield* tool.run({}, { sessionId: s1, callId: "c1" })).toEqual({
      result: "No checks apply to the changes in this run.",
    });

    yield* writeThrough("a.txt", "bad\n");
    const failed = yield* Effect.flip(tool.run({}, { sessionId: s1, callId: "c2" }));
    expect(failed.message).toStartWith("Failed: clean");

    const { project } = yield* Directories;
    yield* (yield* FileSystem.FileSystem).remove(`${project}/checks.json`);
    yield* beforeCall;
    expect(yield* toolNames).toEqual([]);
  }),
  stack,
);

const runTool = (callId: string) =>
  Effect.gen(function* () {
    const tool = Option.getOrThrow(yield* (yield* Tools).get(checksTool));
    const outcome = yield* tool.run({}, { sessionId: s1, callId });

    return outcome.result;
  });

effectTest(
  "a check that passed on the same files is not run again, by the tool, the turn's end or /commit",
  Effect.gen(function* () {
    yield* setUp;
    yield* beforeCall;
    yield* writeThrough("a.txt", "good\n");

    expect(yield* runTool("c1")).toContain("Passed: clean");

    expect(yield* runTool("c2")).toContain("Passed earlier on these files: clean");

    // The turn's end finds nothing left to run, so it saves no report.
    expect(yield* settle).toEqual([]);
    const log = yield* SessionLog;
    const kindsAfter = kinds(yield* log.read(s1, {}));
    expect(kindsAfter).not.toContain(ReportEntry.kind);

    const commit = yield* CommitChecks;
    const same = yield* commit.due(s1, ["a.txt"]);
    expect(same.count).toBe(0);
    expect((yield* same.run).skipped).toEqual(["clean"]);

    yield* writeThrough("a.txt", "other\n");
    expect((yield* commit.due(s1, ["a.txt"])).count).toBe(1);
    expect(yield* runTool("c3")).toContain("Passed: clean");
  }),
  stack,
);
