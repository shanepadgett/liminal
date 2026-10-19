/**
 * `/commit`'s steps on a git workspace and the scripted provider: the changed files, the checks,
 * the plan the small model submits, and the commits it makes.
 */

import { expect, test } from "bun:test";

import { Duration, Effect, FileSystem, Layer, Path, Stream } from "effect";
import { RpcTest } from "effect/rpc";

import agentLoop from "@liminal/agent-loop";
import checks from "@liminal/checks";
import commandRunner from "@liminal/command-runner";
import { CommandRunner } from "@liminal/command-runner/contract";
import context from "@liminal/context";
import inbox from "@liminal/inbox";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { reply, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { Directories, ProjectTrust, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, UserEntry } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";
import toolOutput from "@liminal/tool-output";
import tools from "@liminal/tools";

import commit from "../plugin.ts";
import { ChecksFailed, CommitRpcs } from "../src/contract.ts";
import { parseStatus } from "../src/server/git.ts";
import { planProblem } from "../src/server/plan.ts";

const stack = serverOf(commit).pipe(
  Layer.provideMerge(serverOf(checks)),
  Layer.provideMerge(serverOf(toolOutput)),
  Layer.provideMerge(serverOf(commandRunner)),
  Layer.provideMerge(serverOf(inbox)),
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

const shell = (command: string) =>
  Effect.gen(function* () {
    const { workspace } = yield* Directories;

    return yield* (yield* CommandRunner).run({
      command,
      cwd: workspace,
      timeout: Duration.seconds(10),
    });
  });

const write = (file: string, text: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const { workspace } = yield* Directories;
    yield* (yield* FileSystem.FileSystem).writeFileString(path.join(workspace, file), text);
  });

/** A repository with one commit, then a changed file and a new one. */
const setUp = Effect.gen(function* () {
  yield* shell(
    "git init -q -b main && git config user.email t@example.com && git config user.name T && git config commit.gpgsign false",
  );

  yield* write(".gitignore", "data/\nglobal/\nproject/\n");
  yield* write("a.txt", "one\n");
  yield* shell("git add -A && git commit -q -m 'chore: start'");
  yield* write("a.txt", "two\n");
  yield* write("b.txt", "new\n");
  yield* (yield* SessionLog).create(s1);

  yield* (yield* Settings).write("global", ["agent-loop", "model"], {
    provider: scriptedProvider,
    id: "scripted",
  });

  return yield* RpcTest.makeClient(CommitRpcs);
});

test("status records read renames and untracked files", () => {
  const output = [
    "1 .M N... 100644 100644 100644 abc abc a b.txt",
    "2 R. N... 100644 100644 100644 abc abc R100 new.txt",
    "old.txt",
    "? c d.txt",
    "",
  ].join("\0");

  expect(parseStatus(output)).toEqual([
    { path: "a b.txt", status: "modified" },
    { path: "new.txt", previousPath: "old.txt", status: "renamed" },
    { path: "c d.txt", status: "untracked" },
  ]);
});

const plan = (files: ReadonlyArray<number>, message = "feat: add b") => ({
  commits: [{ message, allFiles: false, files }],
});

test("a plan must hold every file once under conventional subjects", () => {
  expect(planProblem(plan([1, 2]), 2)).toBeUndefined();
  expect(planProblem(plan([1]), 2)).toBe("It leaves out files 2.");
  expect(planProblem(plan([1, 1, 2]), 2)).toContain("files 1 in more than one commit");

  expect(
    planProblem({ commits: [{ message: "feat: add b", allFiles: true, files: [] }] }, 2),
  ).toBeUndefined();

  expect(planProblem(plan([1, 2], "Add b"), 2)).toContain("not a conventional");
});

effectTest(
  "start, plan and apply commit the changes as the planner grouped them",
  Effect.gen(function* () {
    const client = yield* setUp;
    const start = yield* client["commit/start"]();
    expect(start.files.map(({ path }) => path).toSorted()).toEqual(["a.txt", "b.txt"]);
    expect(start.checks).toBe(0);
    expect(start.planner.startsWith(`${scriptedProvider}/`)).toBe(true);

    const numbers = start.files.map((_, index) => index + 1);

    yield* (yield* ScriptedModel).enqueue(
      reply(
        [
          {
            type: "tool-call",
            id: "p1",
            name: "submit_plan",
            params: {
              commits: [{ message: "feat: add b and change a", allFiles: false, files: numbers }],
            },
            providerData: {},
          },
        ],
        { reason: "tool-calls" },
      ),
    );

    const commits = yield* client["commit/plan"]({ session: s1, start, instruction: "" });
    expect(commits.map(({ message }) => message)).toEqual(["feat: add b and change a"]);

    const events = yield* Stream.runCollect(client["commit/apply"]({ root: start.root, commits }));
    expect(events.map(({ _tag }) => _tag)).toEqual(["Committing", "Committed"]);

    const log = yield* shell("git log --format=%s && git status --porcelain");
    expect(log.stdout).toBe("feat: add b and change a\nchore: start\n");

    const target = yield* client["commit/push-target"]({ root: start.root });
    expect(target).toEqual({ name: "origin/main", branch: "main", isNew: true });
  }),
  stack,
);

const planAnswer = (files: ReadonlyArray<number>) =>
  reply(
    [
      {
        type: "tool-call",
        id: "p",
        name: "submit_plan",
        params: { commits: [{ message: "feat: add b", allFiles: false, files }] },
        providerData: {},
      },
    ],
    { reason: "tool-calls" },
  );

effectTest(
  "a plan that repeats a file is asked again, up to three answers",
  Effect.gen(function* () {
    const client = yield* setUp;
    const start = yield* client["commit/start"]();
    const scripted = yield* ScriptedModel;

    yield* scripted.enqueue(planAnswer([1, 1, 2]));
    yield* scripted.enqueue(planAnswer([1, 2, 2]));
    yield* scripted.enqueue(planAnswer([1, 2]));

    const commits = yield* client["commit/plan"]({ session: s1, start, instruction: "" });
    expect(commits.map(({ files }) => files.length)).toEqual([2]);
  }),
  stack,
);

effectTest(
  "failed commit checks go to the session and stop the commit",
  Effect.gen(function* () {
    const client = yield* setUp;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { project } = yield* Directories;
    yield* fs.makeDirectory(project, { recursive: true });
    const file = { commit: [{ name: "never", command: "false" }] };
    yield* fs.writeFileString(path.join(project, "checks.json"), JSON.stringify(file));
    yield* (yield* ProjectTrust).trust;
    yield* (yield* ScriptedModel).enqueue(reply([], { reason: "stop" }));

    const start = yield* client["commit/start"]();
    expect(start.checks).toBe(1);

    const outcome = yield* client["commit/check"]({ session: s1, start });
    expect(outcome).toEqual(ChecksFailed.make({ names: ["never"] }));

    const entries = yield* (yield* SessionLog).read(s1, {});
    const sent = entries.find((entry) => entry.kind === UserEntry.kind);
    expect(sent?.text.startsWith("[commit checks]")).toBe(true);
  }),
  stack,
);
