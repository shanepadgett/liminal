/**
 * Skills: found in the user's and the trusted project's folders, listed to the model, started as
 * the user's message and tagged with `@skill:`.
 */

import { expect } from "bun:test";

import {
  Context as EffectContext,
  Schema,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Predicate,
} from "effect";
import { RpcTest } from "effect/rpc";

import agentLoop from "@liminal/agent-loop";
import context from "@liminal/context";
import { Context, type ContextRequest } from "@liminal/context/contract";
import inbox from "@liminal/inbox";
import { TagText } from "@liminal/inbox/contract";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { reply, ScriptedModel, scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import notices from "@liminal/notices";
import { NoticeEntry } from "@liminal/notices/contract";
import { Directories, draft, ProjectTrust, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog, UserEntry } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import { Settings } from "@liminal/settings/contract";
import tools from "@liminal/tools";

import skills from "../plugin.ts";
import { SkillsRpcs } from "../src/contract.ts";
import { scanSkills } from "../src/server/find.ts";
import { makeSkillTags } from "../src/server/tags.ts";

const stack = serverOf(skills).pipe(
  Layer.provideMerge(serverOf(notices)),
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

/** Writes `<folder>/<name>/SKILL.md`. */
const put = Effect.fn("put")(function* (folder: string, name: string, text: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.join(folder, name), { recursive: true });
  yield* fs.writeFileString(path.join(folder, name, "SKILL.md"), text);

  return path.join(folder, name, "SKILL.md");
});

const skill = (description: string, body: string, extra = "") =>
  `---\ndescription: ${description}\n${extra}---\n${body}`;

/**
 * A user skill, a project skill of the same name, a user-only skill and a broken one, beside a file
 * that is not a skill.
 */
const setUp = Effect.gen(function* () {
  const path = yield* Path.Path;
  const { home, project } = yield* Directories;
  const user = path.join(home, ".agents", "skills");
  yield* put(user, "review", skill("Review the user's way", "User review."));
  yield* put(user, "deploy", skill("Ship it", "Deploy steps.", "disable-model-invocation: true\n"));
  yield* put(user, "broken", "No front matter.");
  yield* (yield* FileSystem.FileSystem).writeFileString(path.join(user, ".DS_Store"), "");
  yield* (yield* ProjectTrust).trust;

  const nearer = yield* put(
    path.join(project, "skills"),
    "review",
    skill('"Review the project\'s way"', "Project review."),
  );

  yield* (yield* SessionLog).create(s1);

  yield* (yield* Settings).write("global", ["agent-loop", "model"], {
    provider: scriptedProvider,
    id: "scripted",
  });

  return nearer;
});

const allText = (request: ContextRequest) =>
  request.messages
    .flatMap(({ parts }) => parts.flatMap((part) => (part.type === "text" ? [part.text] : [])))
    .join("\n");

effectTest(
  "the model sees the nearer skill, not the user-only one; a broken one is told",
  Effect.gen(function* () {
    const nearer = yield* setUp;
    const log = yield* SessionLog;
    const text = "hello";
    yield* log.append(s1, [draft(UserEntry, { data: { text }, text, model: [] })]);
    const request = yield* (yield* Context).build(s1, { provider: "scripted", id: "scripted" });
    const prompt = allText(request);

    expect(prompt).toContain(`- \`review\` (\`${nearer}\`): Review the project's way`);
    expect(prompt).not.toContain("deploy");
    expect(prompt).not.toContain("Project review.");

    const entries = yield* log.read(s1, {});
    const told = entries.flatMap((entry) => (entry.kind === NoticeEntry.kind ? [entry.text] : []));
    expect(told).toHaveLength(1);
    expect(told[0]).toContain("no front matter");
  }),
  stack,
);

effectTest(
  "a skill starts as the user's message with what was typed after it",
  Effect.gen(function* () {
    yield* setUp;
    yield* (yield* ScriptedModel).enqueue(reply([], { reason: "stop" }));
    const client = yield* RpcTest.makeClient(SkillsRpcs);

    const listed = yield* client["skills/list"]();
    expect(listed.map(({ name }) => name)).toEqual(["deploy", "review"]);

    yield* client["skills/use"]({ session: s1, name: "review", args: " src/a.ts " });
    const entries = yield* (yield* SessionLog).read(s1, {});
    const sent = entries.find((entry) => entry.kind === UserEntry.kind);
    expect(sent?.text).toBe("/review src/a.ts");

    const missing = yield* client["skills/use"]({ session: s1, name: "gone", args: "" }).pipe(
      Effect.flip,
    );

    expect(Predicate.isTagged(missing, "UnknownSkill")).toBe(true);
  }),
  stack,
);

effectTest(
  "`@skill:<name>` finds a skill and attaches its text",
  Effect.gen(function* () {
    yield* setUp;
    const services = yield* Effect.context<FileSystem.FileSystem | Path.Path>();

    const finder = {
      fs: EffectContext.get(services, FileSystem.FileSystem),
      path: EffectContext.get(services, Path.Path),
      directories: yield* Directories,
      trust: yield* ProjectTrust,
    };

    const tags = makeSkillTags(Effect.map(scanSkills(finder), ({ skills: found }) => found));
    const rows = yield* tags.find("rev");
    expect(rows.map(({ tag }) => tag)).toEqual(["skill:review"]);

    const attached = yield* tags.attach("skill:review");
    const text = Option.filter(attached, Schema.is(TagText));
    expect(Option.isSome(text) && text.value.text).toContain("Project review.");

    expect(Option.isNone(yield* tags.attach("src/a.ts"))).toBe(true);
  }),
  stack,
);
