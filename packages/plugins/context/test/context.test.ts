/**
 * Context over SQLite: baselines, updates at the point of change, previews and rebuilds after a
 * restart.
 */

import { expect, test } from "bun:test";

import { Context as EffectContext, Effect, Exit, Layer, Ref, Schema, Scope } from "effect";

import { defineEntry, defineTool, draft, type Entry, SessionId, type Tool } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import context from "../plugin.ts";
import {
  Context,
  type ContextRequest,
  definePromptSection,
  fileTextsRender,
  PromptSections,
  type SectionRead,
  SystemData,
  SystemEntry,
  RequestSteps,
  ToolSources,
  ViewSteps,
} from "../src/contract.ts";

/** One run of the plugins over the test's data folder. */
const stack = serverOf(context).pipe(
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

const Prompt = defineEntry({
  kind: "test/prompt",
  data: Schema.String,
  model: true,
  user: "shown",
});

const prompt = (text: string) =>
  draft(Prompt, {
    data: text,
    model: [{ role: "user", parts: [{ type: "text", text, providerData: {} }] }],
    text,
  });

const s1 = SessionId.make("s1");
const model = { provider: "scripted", id: "scripted" };

const tool = (name: string) =>
  defineTool({
    name,
    description: `The ${name} tool`,
    parameters: Schema.Struct({}),
    runAlongside: true,
    safeToRerun: true,
    run: () => Effect.succeed({ result: name }),
  });

/** A tool source with one tool, offered as the tool declares. */
const offer = (one: Tool) => Effect.succeed([{ ...one.spec, offered: one.offeredAtStart }]);

/** Builds the stack in the current scope and registers a notes section read from `notes`. */
const start = Effect.fn("start")(function* (notes: Ref.Ref<SectionRead<string>>) {
  const services = yield* Layer.build(stack);
  const sections = EffectContext.get(services, PromptSections);

  yield* sections.register(
    definePromptSection({
      key: "test/notes",
      order: 900,
      codec: Schema.String,
      read: () => Ref.get(notes),
      render: {
        initial: (value) => `Notes: ${value}`,
        changed: (before, after) => `Notes changed from ${before} to ${after}`,
        removed: (before) => `Notes ${before} removed`,
      },
    }),
  );

  yield* EffectContext.get(services, ToolSources).register(offer(tool("echo")), { order: 0 });

  return services;
});

const isSystemData = Schema.is(SystemData);

const systemData = (entries: ReadonlyArray<Entry>): ReadonlyArray<SystemData> =>
  entries.flatMap((entry) =>
    entry.kind === SystemEntry.kind && isSystemData(entry.data) ? [entry.data] : [],
  );

/** Keeps only the entries from the last prompt on, as a checkpoint would. */
const cut = (_session: SessionId, entries: ReadonlyArray<Entry>) =>
  Effect.succeed(entries.slice(entries.findLastIndex((entry) => entry.kind === Prompt.kind)));

effectTest(
  "the first build saves a baseline that leads the request; an unchanged one saves nothing",
  Effect.gen(function* () {
    const notes = yield* Ref.make<SectionRead<string>>({ type: "present", value: "a" });
    const services = yield* start(notes);
    const log = EffectContext.get(services, SessionLog);
    const built = EffectContext.get(services, Context);
    yield* log.create(s1);
    yield* log.append(s1, [prompt("hello")]);

    const preview = yield* built.preview(s1, model);
    expect(yield* log.read(s1, {})).toHaveLength(1);

    const first = yield* built.build(s1, model);
    expect(first).toEqual(preview);
    expect(first.messages.map((message) => message.role)).toEqual(["system", "user"]);

    expect(first.messages[0]?.parts).toEqual([
      { type: "text", text: "Notes: a", providerData: {} },
    ]);

    expect(first.tools.map((declared) => [declared.name, declared.offered])).toEqual([
      ["echo", true],
    ]);

    expect(yield* built.build(s1, model)).toEqual(first);
    expect(yield* log.read(s1, {})).toHaveLength(2);
  }),
  testBaseServices,
);

effectTest(
  "changes append one update at the point of change; a failed read writes nothing",
  Effect.gen(function* () {
    const notes = yield* Ref.make<SectionRead<string>>({ type: "present", value: "a" });
    const services = yield* start(notes);
    const log = EffectContext.get(services, SessionLog);
    const built = EffectContext.get(services, Context);
    yield* log.create(s1);
    yield* built.build(s1, model);

    yield* Ref.set(notes, { type: "present", value: "b" });
    const later = yield* Scope.make();

    yield* Scope.provide(
      EffectContext.get(services, ToolSources).register(offer(tool("later")), { order: 1 }),
      later,
    );

    yield* log.append(s1, [prompt("next")]);
    const changed = yield* built.build(s1, model);

    expect(changed.messages.map((message) => message.role)).toEqual(["system", "user", "user"]);

    expect(changed.messages.at(-1)?.parts).toEqual([
      {
        type: "text",
        text: '<reminder kind="instructions">\nNotes changed from a to b\n</reminder>',
        providerData: {},
      },
      { type: "tool-change", change: "offer", tool: tool("later").spec },
    ]);

    expect(changed.tools.map((declared) => declared.name)).toEqual(["echo"]);

    yield* Ref.set(notes, { type: "unavailable" });
    yield* built.build(s1, model);
    expect(systemData(yield* log.read(s1, {}))).toHaveLength(2);

    yield* Ref.set(notes, { type: "removed" });
    yield* Scope.close(later, Exit.void);
    yield* built.build(s1, model);

    expect(systemData(yield* log.read(s1, {})).at(-1)).toEqual({
      type: "update",
      sections: [{ type: "removed", key: "test/notes", text: "Notes b removed" }],
      tools: [{ change: "withdraw", tool: tool("later").spec }],
    });
  }),
  testBaseServices,
);

effectTest(
  "a view step that leaves no baseline in view gets a full one",
  Effect.gen(function* () {
    const notes = yield* Ref.make<SectionRead<string>>({ type: "present", value: "a" });
    const services = yield* start(notes);
    const log = EffectContext.get(services, SessionLog);
    const built = EffectContext.get(services, Context);
    yield* log.create(s1);
    yield* built.build(s1, model);
    yield* log.append(s1, [prompt("checkpoint")]);

    yield* EffectContext.get(services, ViewSteps).register(cut, { order: 0 });
    const request = yield* built.build(s1, model);

    expect(request.messages.map((message) => message.role)).toEqual(["system", "user"]);

    expect(systemData(yield* log.read(s1, {})).map((data) => data.type)).toEqual([
      "baseline",
      "baseline",
    ]);
  }),
  testBaseServices,
);

effectTest(
  "a reopened log rebuilds the same request",
  Effect.gen(function* () {
    const notes = yield* Ref.make<SectionRead<string>>({ type: "present", value: "a" });

    const before = yield* Effect.scoped(
      Effect.gen(function* () {
        const services = yield* start(notes);
        const log = EffectContext.get(services, SessionLog);
        yield* log.create(s1);
        yield* log.append(s1, [prompt("hello")]);
        yield* EffectContext.get(services, Context).build(s1, model);
        yield* Ref.set(notes, { type: "present", value: "b" });
        yield* log.append(s1, [prompt("again")]);

        return yield* EffectContext.get(services, Context).build(s1, model);
      }),
    );

    yield* Effect.scoped(
      Effect.gen(function* () {
        const services = yield* start(notes);
        expect(yield* EffectContext.get(services, Context).build(s1, model)).toEqual(before);
        expect(yield* EffectContext.get(services, SessionLog).read(s1, {})).toHaveLength(4);
      }),
    );
  }),
  testBaseServices,
);

/** Marks every message, as a cache step would. */
const markAll = (_session: SessionId, request: ContextRequest) =>
  Effect.succeed({
    ...request,
    messages: request.messages.map((message) => ({ ...message, cache: "breakpoint" as const })),
  });

effectTest(
  "request steps rewrite build and preview alike; what they add is not saved",
  Effect.gen(function* () {
    const notes = yield* Ref.make<SectionRead<string>>({ type: "present", value: "a" });
    const services = yield* start(notes);
    const log = EffectContext.get(services, SessionLog);
    const built = EffectContext.get(services, Context);
    yield* log.create(s1);
    yield* log.append(s1, [prompt("hello")]);
    yield* EffectContext.get(services, RequestSteps).register(markAll, { order: 0 });

    const preview = yield* built.preview(s1, model);
    const request = yield* built.build(s1, model);

    expect(request).toEqual(preview);
    expect(request.messages.map((message) => message.cache)).toEqual(["breakpoint", "breakpoint"]);

    const saved = (yield* log.read(s1, {})).flatMap((entry) => entry.model ?? []);
    expect(saved.map((message) => message.cache)).toEqual([undefined, undefined]);
  }),
  testBaseServices,
);

test("file sections send whole files, then diffs, added files and removed lines", () => {
  const lines = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`);
  const a = { path: "a.md", text: lines.join("\n") };
  const b = { path: "b.md", text: "bee" };

  expect(fileTextsRender.initial([a, b])).toBe(
    `<file path="a.md">\n${a.text}\n</file>\n\n<file path="b.md">\nbee\n</file>`,
  );

  const edited = { path: "a.md", text: lines.with(5, "line six").join("\n") };
  const added = { path: "c.md", text: "sea" };

  expect(fileTextsRender.changed([a, b], [edited, added])).toBe(
    [
      "`a.md` changed:",
      "```diff",
      "@@ -4,5 +4,5 @@",
      " line 4",
      " line 5",
      "-line 6",
      "+line six",
      " line 7",
      " line 8",
      "```",
      "",
      '<file path="c.md">\nsea\n</file>',
      "",
      "`b.md` was removed; stop following it.",
    ].join("\n"),
  );

  expect(fileTextsRender.changed([b], [{ path: "b.md", text: "bees" }])).toBe(
    '<file path="b.md">\nbees\n</file>',
  );

  expect(fileTextsRender.removed?.([a])).toBe("`a.md` was removed; stop following it.");
});
