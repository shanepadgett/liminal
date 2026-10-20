/** Tools guidance: the guidance of registered tools, once each, kept current as tools come and go. */

import { expect } from "bun:test";

import { Context as EffectContext, Effect, Exit, Layer, Schema, Scope } from "effect";

import context from "@liminal/context";
import { Context, type ContextRequest } from "@liminal/context/contract";
import { defineEntry, defineTool, draft, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import toolsPlugin from "../plugin.ts";
import { Tools } from "../src/contract.ts";

const stack = serverOf(toolsPlugin).pipe(
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

const prompt = (text: string) =>
  draft(Prompt, {
    data: text,
    model: [{ role: "user", parts: [{ type: "text", text, providerData: {} }] }],
    text,
  });

const s1 = SessionId.make("s1");
const model = { provider: "scripted", id: "scripted" };

const tool = (name: string, guidance: ReadonlyArray<string>, offer: "start" | "search" = "start") =>
  defineTool({
    name,
    offer,
    description: `The ${name} tool`,
    parameters: Schema.Struct({}),
    guidance,
    runAlongside: true,
    safeToRerun: true,
    run: () => Effect.succeed({ result: name }),
  });

/** The text parts of the request's last message. */
const lastTexts = (request: ContextRequest) =>
  (request.messages.at(-1)?.parts ?? []).flatMap((part) =>
    part.type === "text" ? [part.text] : [],
  );

/** Builds the stack, starts a session and returns its next request after `prompt`. */
const start = Effect.fn("start")(function* () {
  const services = yield* Layer.build(stack);
  yield* EffectContext.get(services, SessionLog).create(s1);

  const next = Effect.fn("next")(function* (text: string) {
    yield* EffectContext.get(services, SessionLog).append(s1, [prompt(text)]);

    return yield* EffectContext.get(services, Context).build(s1, model);
  });

  return { tools: EffectContext.get(services, Tools), next };
});

effectTest(
  "shared lines render once in tool-name order; tools added and removed later update them",
  Effect.gen(function* () {
    const { tools, next } = yield* start();
    yield* tools.register(tool("write", ["Read a file before changing it.", "Write new files."]));
    yield* tools.register(tool("edit", ["Keep oldText short.", "Read a file before changing it."]));

    const first = yield* next("hello");

    expect(first.messages[0]?.parts).toEqual([
      {
        type: "text",
        text: "<tool_rules>\n- Keep oldText short.\n- Read a file before changing it.\n- Write new files.\n</tool_rules>",
        providerData: {},
      },
    ]);

    const later = yield* Scope.make();
    yield* Scope.provide(tools.register(tool("shell", ["Run tests with shell."])), later);

    expect(lastTexts(yield* next("added"))).toEqual([
      '<reminder kind="instructions">\nNew tool guidance:\n- Run tests with shell.\n</reminder>',
    ]);

    yield* Scope.close(later, Exit.void);

    expect(lastTexts(yield* next("removed"))).toEqual([
      '<reminder kind="instructions">\nNo longer applies:\n- Run tests with shell.\n</reminder>',
    ]);
  }),
  testBaseServices,
);

effectTest(
  "a deferred tool's guidance stays out of the system prompt",
  Effect.gen(function* () {
    const { tools, next } = yield* start();
    yield* tools.register(tool("read", ["Use read for files."]));
    yield* tools.register(tool("lookup", ["Look things up."], "search"));

    const first = yield* next("hello");

    expect(first.messages[0]?.parts).toEqual([
      {
        type: "text",
        text: "<tool_rules>\n- Use read for files.\n</tool_rules>",
        providerData: {},
      },
    ]);
  }),
  testBaseServices,
);

effectTest(
  "tools without guidance add nothing to the system prompt",
  Effect.gen(function* () {
    const { tools, next } = yield* start();
    yield* tools.register(tool("echo", []));

    const first = yield* next("hello");

    expect(first.messages.map((message) => message.role)).toEqual(["user"]);
  }),
  testBaseServices,
);
