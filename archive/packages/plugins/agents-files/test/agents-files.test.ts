/** Agents files: every `AGENTS.md` in one section, kept current, with read problems told once. */

import { expect } from "bun:test";

import { Context as EffectContext, Effect, FileSystem, Layer, Path, Schema } from "effect";

import context from "@liminal/context";
import { Context } from "@liminal/context/contract";
import notices from "@liminal/notices";
import { NoticeEntry } from "@liminal/notices/contract";
import { defineEntry, Directories, draft, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import agentsFiles from "../plugin.ts";

const stack = serverOf(agentsFiles).pipe(
  Layer.provideMerge(serverOf(notices)),
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const Said = defineEntry({ kind: "test/said", data: Schema.String, model: true, user: "shown" });

const session = SessionId.make("s1");

/** Builds the stack and returns a step that says `text` and gives the request's messages as text. */
const open = Effect.fn("open")(function* () {
  const services = yield* Layer.build(stack);
  const log = EffectContext.get(services, SessionLog);
  yield* log.create(session);

  const ask = Effect.fn("ask")(function* (text: string) {
    yield* log.append(session, [
      draft(Said, {
        data: text,
        text,
        model: [{ role: "user", parts: [{ type: "text", text, providerData: {} }] }],
      }),
    ]);

    const request = yield* EffectContext.get(services, Context).build(session, {
      provider: "scripted",
      id: "scripted",
    });

    return request.messages.flatMap((message) =>
      message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
    );
  });

  const noticeCount = Effect.map(
    log.read(session, {}),
    (entries) => entries.filter((entry) => entry.kind === NoticeEntry.kind).length,
  );

  return { ask, noticeCount };
});

effectTest(
  "files load most shared first; a change is sent as a diff and a removal as a line",
  Effect.gen(function* () {
    const { ask } = yield* open();
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { home, global, workspace } = yield* Directories;
    const user = path.join(home, ".agents", "AGENTS.md");
    const project = path.join(workspace, "AGENTS.md");

    yield* fs.makeDirectory(path.dirname(user), { recursive: true });
    yield* fs.writeFileString(user, "Be brief.");
    yield* fs.writeFileString(path.join(global, "AGENTS.md"), "Use tabs.");
    const rules = Array.from({ length: 20 }, (_, index) => `Rule ${index}.`).join("\n");
    yield* fs.writeFileString(project, `Run the tests.\n${rules}`);

    const first = (yield* ask("hello")).join("\n");

    expect(first.indexOf("Be brief.")).toBeLessThan(first.indexOf("Use tabs."));
    expect(first.indexOf("Use tabs.")).toBeLessThan(first.indexOf("Run the tests."));
    expect(first).toContain(`<file path="${project}">\nRun the tests.\n`);

    yield* fs.writeFileString(project, `Run the tests and lint.\n${rules}`);

    expect((yield* ask("again")).at(-1)).toContain(`\`${project}\` changed:`);

    yield* fs.remove(project);

    expect((yield* ask("later")).at(-1)).toContain(
      `\`${project}\` was removed; stop following it.`,
    );
  }),
  testBaseServices,
);

effectTest(
  "no files leave the section out",
  Effect.gen(function* () {
    const { ask } = yield* open();

    expect((yield* ask("hello")).join("\n")).not.toContain("<file");
  }),
  testBaseServices,
);

effectTest(
  "an unreadable file tells the session once",
  Effect.gen(function* () {
    const { ask, noticeCount } = yield* open();
    const fs = yield* FileSystem.FileSystem;
    const { workspace } = yield* Directories;
    yield* fs.makeDirectory(`${workspace}/AGENTS.md`);

    yield* ask("hello");
    yield* ask("again");

    expect(yield* noticeCount).toBe(1);
  }),
  testBaseServices,
);
