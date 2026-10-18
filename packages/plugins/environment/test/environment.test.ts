/** Environment: the workspace facts and its two-level listing, kept current as they change. */

import { expect, test } from "bun:test";

import { Context as EffectContext, Duration, Effect, FileSystem, Layer, Schema } from "effect";
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
