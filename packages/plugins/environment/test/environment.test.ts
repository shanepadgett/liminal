/** Environment: the workspace facts and its two-level listing, kept current as they change. */

import { expect, test } from "bun:test";

import {
  Context as EffectContext,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
} from "effect";
import { TestClock } from "effect/testing";

import commandRunner from "@liminal/command-runner";
import { CommandRunner } from "@liminal/command-runner/contract";
import context from "@liminal/context";
import { Context, type ContextRequest } from "@liminal/context/contract";
import { defineEntry, Directories, draft, type ModelContent, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import environment from "../plugin.ts";
import { twoLevels } from "../src/server/files.ts";
import { homeRelative, readSession } from "../src/server/session.ts";

const stack = serverOf(environment).pipe(
  Layer.provideMerge(serverOf(commandRunner)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const Prompt = defineEntry({
  kind: "test/prompt",
  data: Schema.String,
  model: true,
  user: "shown",
});

const s1 = SessionId.make("s1");
const model = { provider: "scripted", id: "scripted" };

/** The text parts of a message. */
const texts = (request: ContextRequest, index: number) =>
  (request.messages.at(index)?.parts ?? []).flatMap((part) =>
    part.type === "text" ? [part.text] : [],
  );

/** Builds the stack, starts a session and returns the workspace and a next-request step. */
const start = Effect.fn("start")(function* () {
  const services = yield* Layer.build(stack);
  const log = EffectContext.get(services, SessionLog);
  yield* log.create(s1);

  const next = Effect.fn("next")(function* (text: string) {
    const said: ReadonlyArray<ModelContent> = [
      { role: "user", parts: [{ type: "text", text, providerData: {} }] },
    ];

    yield* log.append(s1, [draft(Prompt, { data: text, model: said, text })]);

    return yield* EffectContext.get(services, Context).build(s1, model);
  });

  const workspace = (yield* Directories).workspace;

  return { services, workspace, next };
});

test("paths cut to two levels, folders ending in a slash", () => {
  expect(twoLevels(["a.txt", "src/b.ts", "src/deep/c.ts", "src/deep/d.ts"])).toEqual([
    "a.txt",
    "src/",
    "src/b.ts",
    "src/deep/",
  ]);
});

effectTest(
  "outside git: facts and visible names two levels deep; added files and a new day update them",
  Effect.gen(function* () {
    const { workspace, next } = yield* start();
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(`${workspace}/src/deep`, { recursive: true });
    yield* fs.writeFileString(`${workspace}/src/deep/c.ts`, "");
    yield* fs.writeFileString(`${workspace}/.hidden`, "");

    const [facts = "", files = ""] = texts(yield* next("hello"), 0);

    expect(facts).toContain(`- Workspace: ${workspace}\n- Git repository: no\n- Platform: `);
    expect(facts).toMatch(/\n- Date: \w+/);
    expect(files.split("\n")).toContain("- src/deep/");
    expect(files).not.toContain(".hidden");
    expect(files).not.toContain("c.ts");

    yield* fs.writeFileString(`${workspace}/src/b.ts`, "");
    yield* TestClock.adjust(Duration.days(1));

    const [update = ""] = texts(yield* next("later"), -1);

    expect(update).toMatch(
      /^<reminder kind="instructions">\nThe environment changed:\n- Date: .+\n\nFiles added:\n- src\/b\.ts\n<\/reminder>$/,
    );
  }),
  testBaseServices,
);

effectTest(
  "in a git repository, ignored files are left out",
  Effect.gen(function* () {
    const { services, workspace, next } = yield* start();
    const fs = yield* FileSystem.FileSystem;

    yield* EffectContext.get(services, CommandRunner).run({
      command: "git init -q",
      cwd: workspace,
      timeout: Duration.seconds(10),
    });

    yield* fs.writeFileString(`${workspace}/.gitignore`, "data/\nglobal/\nproject/\n");
    yield* fs.writeFileString(`${workspace}/kept.ts`, "");

    const [facts = "", files = ""] = texts(yield* next("hello"), 0);

    expect(facts).toContain("Git repository: yes");
    expect(files).toBe("The workspace, two levels deep:\n- .gitignore\n- kept.ts");
  }),
  testBaseServices,
);

test("the home folder is written as ~", () => {
  expect(homeRelative("/home/me", "/home/me")).toBe("~");
  expect(homeRelative("/home/me/dev/app", "/home/me")).toBe("~/dev/app");
  expect(homeRelative("/home/mel/dev", "/home/me")).toBe("/home/mel/dev");
  expect(homeRelative("/srv/app", "/home/me")).toBe("/srv/app");
});

/** The Session section's facts for the test workspace, with a runner for git commands. */
const sessionTools = Effect.gen(function* () {
  const services = yield* Layer.build(serverOf(commandRunner));
  const runner = EffectContext.get(services, CommandRunner);
  const folder = (yield* Directories).workspace;

  const workspace = { fs: yield* FileSystem.FileSystem, path: yield* Path.Path, runner, folder };

  const git = (command: string) =>
    runner.run({ command: `git ${command}`, cwd: folder, timeout: Duration.seconds(10) });

  return { workspace, git, read: readSession(workspace, "/nowhere") };
});

effectTest(
  "outside a repository the session has a folder and no branch",
  Effect.gen(function* () {
    const { workspace, read } = yield* sessionTools;

    expect(yield* read).toEqual({ folder: workspace.folder });
  }),
  testBaseServices,
);

effectTest(
  "in a repository the session shows the branch, then the short hash of a detached HEAD",
  Effect.gen(function* () {
    const { workspace, git, read } = yield* sessionTools;

    yield* git("init -q -b main");
    expect(yield* read).toEqual({ folder: workspace.folder, branch: "main" });

    yield* git("-c user.name=t -c user.email=t@t commit -q --allow-empty -m first");
    yield* git("checkout -q --detach");

    const detached = yield* read;
    expect(detached.branch).toMatch(/^[0-9a-f]{4,}$/);
  }),
  testBaseServices,
);
