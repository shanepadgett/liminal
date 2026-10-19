/**
 * Usage counted from a real session log: each model's calls summed, the latest call's context and
 * the cost at catalog prices.
 */

import { expect } from "bun:test";

import { Duration, Effect, Fiber, Layer, Option, Stream } from "effect";
import { RpcTest } from "effect/rpc";
import { TestClock } from "effect/testing";

import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import { scriptedProvider } from "@liminal/model-scripted/contract";
import models from "@liminal/models";
import { draft, type ModelInfo, type ModelRef, SessionId, type Usage } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import {
  SessionLog,
  TextEntry,
  TurnStartedEntry,
  userMessage,
} from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";

import usage from "../plugin.ts";
import { UsageRpcs } from "../src/contract.ts";
import { usageOf } from "../src/server.ts";
import { countCalls } from "../src/server/count.ts";

const stack = serverOf(sessionLog).pipe(
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(serverOf(settingsPlugin)),
  Layer.provideMerge(testBaseServices),
);

const served = serverOf(usage).pipe(
  Layer.provideMerge(serverOf(modelScripted)),
  Layer.provideMerge(serverOf(models)),
  Layer.provideMerge(serverOf(modelCatalog)),
  Layer.provideMerge(stack),
);

const s1 = SessionId.make("s1");
const big: ModelRef = { provider: "test", id: "big" };
const small: ModelRef = { provider: "test", id: "small" };

const spentOf = (input: number, cacheRead: number, output: number): Usage => ({
  input,
  output,
  cacheRead,
  cacheWrite: 0,
  reasoning: 0,
});

const turn = (model: ModelRef) => draft(TurnStartedEntry, { data: { model }, text: "" });

const replied = (spent: Usage) =>
  draft(TextEntry, {
    data: { text: "ok", interrupted: false, finish: { reason: "stop", usage: spent } },
    model: [{ role: "assistant", parts: [{ type: "text", text: "ok", providerData: {} }] }],
    text: "ok",
  });

const info = (id: string): ModelInfo => ({
  id,
  name: id,
  contextWindow: 200_000,
  maxOutput: 8000,
  thinking: [],
  input: ["text"],
});

const priced = (id: string, price: NonNullable<ModelInfo["price"]>): ModelInfo => ({
  ...info(id),
  price,
});

const entriesOf = (...drafts: Parameters<SessionLog["Service"]["append"]>[1]) =>
  Effect.gen(function* () {
    const log = yield* SessionLog;
    yield* log.create(s1);
    yield* log.append(s1, drafts);

    return yield* log.read(s1, {});
  });

effectTest(
  "nothing is counted before the first reply",
  Effect.gen(function* () {
    const entries = yield* entriesOf(turn(big), userMessage("hi"));

    expect(Option.isNone(countCalls(entries))).toBe(true);
  }),
  stack,
);

effectTest(
  "calls are summed per model and the latest call gives the context",
  Effect.gen(function* () {
    const entries = yield* entriesOf(
      turn(big),
      replied(spentOf(1000, 0, 100)),
      replied(spentOf(200, 1000, 50)),
      turn(small),
      replied(spentOf(100, 900, 20)),
    );

    const counted = Option.getOrThrow(countCalls(entries));

    expect(counted.latest).toEqual({ model: small, usage: spentOf(100, 900, 20) });

    expect(counted.byModel).toEqual([
      { model: big, usage: spentOf(1200, 1000, 150) },
      { model: small, usage: spentOf(100, 900, 20) },
    ]);

    const shown = usageOf(counted, [
      {
        calls: { model: big, usage: spentOf(1200, 1000, 150) },
        info: Option.some(
          priced("big", { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }),
        ),
      },
      { calls: { model: small, usage: spentOf(100, 900, 20) }, info: Option.some(info("small")) },
    ]);

    // 1,200 × 3 + 1,000 × 0.3 + 150 × 15 = 6,150 per million.
    expect(shown).toEqual({
      context: 1020,
      contextWindow: 200_000,
      cacheHit: 0.9,
      cost: 0.00615,
      unpriced: 1,
    });
  }),
  stack,
);

effectTest(
  "a model without details shows no window and no cost",
  Effect.gen(function* () {
    const entries = yield* entriesOf(turn(big), replied(spentOf(0, 0, 10)));
    const counted = Option.getOrThrow(countCalls(entries));

    expect(usageOf(counted, [{ calls: counted.latest, info: Option.none() }])).toEqual({
      context: 10,
      unpriced: 1,
    });
  }),
  stack,
);

effectTest(
  "the session's usage streams once its entries settle",
  Effect.gen(function* () {
    const scripted: ModelRef = { provider: scriptedProvider, id: "scripted" };
    yield* entriesOf(turn(scripted), replied(spentOf(500, 1500, 100)));

    const client = yield* RpcTest.makeClient(UsageRpcs);

    const first = yield* client["usage/session"]({ session: s1 }).pipe(
      Stream.take(1),
      Stream.runHead,
      Effect.forkChild,
    );

    yield* TestClock.adjust(Duration.seconds(1));

    expect(yield* Fiber.join(first)).toEqual(
      Option.some({ context: 2100, contextWindow: 200_000, cacheHit: 0.75, unpriced: 1 }),
    );
  }),
  served,
);

effectTest(
  "a session followed before its first prompt counts once it replies",
  Effect.gen(function* () {
    const scripted: ModelRef = { provider: scriptedProvider, id: "scripted" };
    const client = yield* RpcTest.makeClient(UsageRpcs);

    const first = yield* client["usage/session"]({ session: s1 }).pipe(
      Stream.take(1),
      Stream.runHead,
      Effect.forkChild,
    );

    yield* TestClock.adjust(Duration.seconds(1));
    yield* entriesOf(turn(scripted), replied(spentOf(100, 0, 10)));
    yield* TestClock.adjust(Duration.seconds(1));

    expect(yield* Fiber.join(first)).toEqual(
      Option.some({ context: 110, contextWindow: 200_000, cacheHit: 0, unpriced: 1 }),
    );
  }),
  served,
);
