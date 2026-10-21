/** Models over the scripted provider: replies, failures, hangs, gates and captured requests. */

import { expect } from "bun:test";

import { Effect, Exit, Fiber, Latch, Layer, Predicate, Stream } from "effect";

import modelCatalog from "@liminal/model-catalog";
import models from "@liminal/models";
import { Models } from "@liminal/models/contract";
import { ModelError, type ModelRequest, ThinkingOff } from "@liminal/sdk";
import { effectTest, testPlugin } from "@liminal/sdk/testing";

import modelScripted from "../plugin.ts";
import { replyText, ScriptedModel, scriptedProvider } from "../src/contract.ts";

const modelsLayer = testPlugin(models, testPlugin(modelCatalog, Layer.empty));
const testLayer = testPlugin(modelScripted, modelsLayer).pipe(Layer.provideMerge(modelsLayer));

const request = (text: string): ModelRequest => ({
  model: { provider: scriptedProvider, id: "scripted" },
  messages: [{ role: "user", parts: [{ type: "text", text, providerData: {} }] }],
  tools: [],
  thinking: ThinkingOff.make({}),
});

const types = (events: ReadonlyArray<{ readonly type: string }>) =>
  events.map((event) => event.type);

effectTest(
  "a queued reply streams in order, then the repeated one answers",
  Effect.gen(function* () {
    const scripted = yield* ScriptedModel;
    const service = yield* Models;
    yield* scripted.enqueue(replyText("first"));
    yield* scripted.repeat(replyText("again"));

    const first = yield* Stream.runCollect(service.stream(request("one")));
    expect(types(first)).toEqual(["start", "part-start", "delta", "part-end", "finish"]);

    expect(first[3]).toEqual({
      type: "part-end",
      index: 0,
      part: { type: "text", text: "first", providerData: {} },
    });

    for (const prompt of ["two", "three"]) {
      const events = yield* Stream.runCollect(service.stream(request(prompt)));
      expect(events[2]).toEqual({ type: "delta", index: 0, text: "again" });
    }

    const prompts = (yield* scripted.requests).map((sent) => sent.messages[0]?.parts[0]);

    expect(prompts).toEqual(
      ["one", "two", "three"].map((text) => ({ type: "text", text, providerData: {} })),
    );
  }),
  testLayer,
);

effectTest(
  "a failure after events ends the stream with the error",
  Effect.gen(function* () {
    const scripted = yield* ScriptedModel;
    const error = new ModelError({ reason: "rate-limit", message: "slow down", status: 429 });
    yield* scripted.enqueue([...replyText("partial").slice(0, 3), { type: "fail", error }]);

    const seen: Array<string> = [];

    const exit = yield* (yield* Models).stream(request("go")).pipe(
      Stream.runForEach((event) => Effect.sync(() => seen.push(event.type))),
      Effect.exit,
    );

    expect(seen).toEqual(["start", "part-start", "delta"]);
    expect(exit).toEqual(Exit.fail(error));
  }),
  testLayer,
);

effectTest(
  "a hang waits until interrupted, and a gate until opened",
  Effect.gen(function* () {
    const scripted = yield* ScriptedModel;
    const service = yield* Models;
    const gate = yield* Latch.make();
    yield* scripted.enqueue([{ type: "hang" }], [{ type: "gate", gate }, ...replyText("open")]);

    const hung = yield* Effect.forkChild(Stream.runCollect(service.stream(request("hang"))));
    yield* Effect.yieldNow;
    expect(hung.pollUnsafe()).toBeUndefined();
    yield* Fiber.interrupt(hung);

    const gated = yield* Effect.forkChild(Stream.runCollect(service.stream(request("gate"))));
    yield* Effect.yieldNow;
    expect(gated.pollUnsafe()).toBeUndefined();
    yield* gate.open;
    expect(types(yield* Fiber.join(gated))).toContain("finish");
  }),
  testLayer,
);

effectTest(
  "an unknown provider fails, and providers list their models",
  Effect.gen(function* () {
    const service = yield* Models;
    const unknown = { ...request("x"), model: { provider: "missing", id: "m" } };
    const error = yield* service.stream(unknown).pipe(Stream.runDrain, Effect.flip);
    expect(Predicate.isTagged(error, "ProviderNotFound")).toBe(true);

    expect(yield* service.listProviders).toEqual([{ id: scriptedProvider, name: "Scripted" }]);
    const listed = yield* service.listModels(scriptedProvider);
    expect(listed.map((info) => info.id)).toEqual(["scripted"]);
  }),
  testLayer,
);
