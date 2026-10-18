/** Instruction files: `always` text, `read-when` lines, bad files told once, and the trust rule. */

import { expect } from "bun:test";

import { Context as EffectContext, Effect, FileSystem, Layer, Path, Schema } from "effect";

import context from "@liminal/context";
import { Context, type ContextRequest } from "@liminal/context/contract";
import notices from "@liminal/notices";
import { NoticeEntry } from "@liminal/notices/contract";
import { defineEntry, Directories, draft, ProjectTrust, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import instructionFiles from "../plugin.ts";

const stack = serverOf(instructionFiles).pipe(
  Layer.provideMerge(serverOf(notices)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const Typed = defineEntry({ kind: "test/typed", data: Schema.String, model: true, user: "shown" });

const id = SessionId.make("s1");

/** Every text part of the request, joined. */
const allText = (request: ContextRequest) =>
  request.messages
    .flatMap(({ parts }) => parts.flatMap((part) => (part.type === "text" ? [part.text] : [])))
    .join("\n");

/** Writes `text` to `name` in the `instructions` folder under `folder`. */
const put = Effect.fn("put")(function* (folder: string, name: string, text: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const instructions = path.join(folder, "instructions");
  yield* fs.makeDirectory(instructions, { recursive: true });
  yield* fs.writeFileString(path.join(instructions, name), text);

  return path.join(instructions, name);
});

/** Starts a session; `turn` types a message and returns the whole request as text. */
const session = Effect.fn("session")(function* () {
  const services = yield* Layer.build(stack);
  const log = EffectContext.get(services, SessionLog);
  const build = EffectContext.get(services, Context).build;
  yield* log.create(id);

  const turn = (text: string) =>
    log
      .append(id, [draft(Typed, { data: text, text, model: [] })])
      .pipe(
        Effect.andThen(build(id, { provider: "scripted", id: "scripted" })),
        Effect.map(allText),
      );

  const notes = Effect.map(log.read(id, {}), (entries) =>
    entries.filter(({ kind }) => kind === NoticeEntry.kind),
  );

  return { turn, notes };
});

effectTest(
  "an always file sends its text; a read-when file sends its path and situation",
  Effect.gen(function* () {
    const { global } = yield* Directories;
    yield* put(global, "style.md", "---\nalways: true\n---\nPrefer short names.");
    const tests = yield* put(global, "tests.md", "---\nread-when: writing tests\n---\nUse bun.");

    const text = yield* (yield* session()).turn("hello");

    expect(text).toContain("Prefer short names.");
    expect(text).toContain(`- \`${tests}\`: writing tests`);
    expect(text).not.toContain("Use bun.");
  }),
  testBaseServices,
);

effectTest(
  "a file with bad front matter is skipped and told once",
  Effect.gen(function* () {
    const { global } = yield* Directories;
    yield* put(global, "bad.md", "No front matter.");
    const { turn, notes } = yield* session();

    expect(yield* turn("hello")).not.toContain("No front matter.");

    yield* turn("again");
    const told = yield* notes;

    expect(told).toHaveLength(1);
    expect(told[0]?.text).toContain("Skipped an instruction file");
  }),
  testBaseServices,
);

effectTest(
  "project files load only once the workspace is trusted, and a nearer file wins by name",
  Effect.gen(function* () {
    const { global, project } = yield* Directories;
    const shared = yield* put(global, "style.md", "---\nalways: true\n---\nUse tabs.");
    yield* put(project, "style.md", "---\nalways: true\n---\nUse spaces.");
    const { turn } = yield* session();

    const untrusted = yield* turn("hello");

    expect(untrusted).toContain("Use tabs.");
    expect(untrusted).not.toContain("Use spaces.");

    yield* (yield* ProjectTrust).trust;
    const trusted = yield* turn("again");

    expect(trusted).toContain("Use spaces.");
    expect(trusted).toContain(`\`${shared}\` was removed; stop following it.`);
  }),
  testBaseServices,
);
