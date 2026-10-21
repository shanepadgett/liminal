/** Cache-hints: which messages get a cache mark, and that context's preview shows them. */

import { expect, test } from "bun:test";

import { Context as EffectContext, Effect, Layer, Schema } from "effect";

import context from "@liminal/context";
import { Context, type ContextRequest } from "@liminal/context/contract";
import { defineEntry, draft, type ModelContent, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";

import cacheHints from "../plugin.ts";
import { marksOf } from "../src/server/marks.ts";

const said = (role: ModelContent["role"], text: string): ModelContent => ({
  role,
  parts: [{ type: "text", text, providerData: {} }],
});

const requestOf = (messages: ReadonlyArray<ModelContent>): ContextRequest => ({
  model: { provider: "scripted", id: "scripted" },
  messages,
  tools: [],
});

const marked = (request: ContextRequest) =>
  request.messages.map((message) => message.cache === "breakpoint");

test("marks the first system message and the last message", () => {
  const request = requestOf([
    said("system", "base"),
    said("user", "one"),
    said("assistant", "two"),
    said("user", "three"),
    said("assistant", "four"),
    said("tool", "five"),
  ]);

  expect(marked(marksOf(request))).toEqual([true, false, false, false, false, true]);
});

test("a lone system message takes one mark; no system message leaves only the last", () => {
  expect(marked(marksOf(requestOf([said("system", "base")])))).toEqual([true]);

  expect(marked(marksOf(requestOf([said("user", "hi"), said("assistant", "hello")])))).toEqual([
    false,
    true,
  ]);

  expect(marksOf(requestOf([])).messages).toEqual([]);
});

const Prompt = defineEntry({
  kind: "test/prompt",
  data: Schema.String,
  model: true,
  user: "shown",
});

const stack = serverOf(cacheHints).pipe(
  Layer.provideMerge(serverOf(context)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
);

effectTest(
  "context's preview carries the marks",
  Effect.gen(function* () {
    const services = yield* Layer.build(stack);
    const log = EffectContext.get(services, SessionLog);
    const s1 = SessionId.make("s1");
    yield* log.create(s1);
    yield* log.append(s1, [draft(Prompt, { data: "hi", model: [said("user", "hi")], text: "hi" })]);

    const request = yield* EffectContext.get(services, Context).preview(s1, {
      provider: "scripted",
      id: "scripted",
    });

    expect(request.messages.at(-1)?.cache).toBe("breakpoint");
  }),
  testBaseServices,
);
