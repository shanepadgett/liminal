/**
 * The `process_*` tools through a holder program the plugin starts: a quick command's output, a
 * long one listed and stopped, the reminder of commands that kept running, and an exit that
 * continues the turn.
 */

import { expect } from "bun:test";

import { Effect, Layer, Option, Schema } from "effect";
import { TestClock } from "effect/testing";

import { BeforeCall, BeforeCallHooks, TurnEndingHooks } from "@liminal/agent-loop/contract";
import { KeyedRegistry, Registry, SessionId } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import sessionStore from "@liminal/session-store";
import { Tools } from "@liminal/tools/contract";

import processes from "../plugin.ts";
import { processTools } from "../src/contract.ts";

const stack = serverOf(processes).pipe(
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(
    Layer.mergeAll(
      Registry.layer(BeforeCallHooks),
      Registry.layer(TurnEndingHooks),
      KeyedRegistry.layer(Tools, (tool) => tool.spec.name),
    ),
  ),
  Layer.provideMerge(testBaseServices),
);

const sessionId = SessionId.make("s1");
const settings = { model: { provider: "scripted", id: "m" } };

const call = (name: string, params: Record<string, string | number>) =>
  Effect.gen(function* () {
    const tool = Option.getOrThrow(yield* (yield* Tools).get(name));
    const output = yield* tool.run(params, { sessionId, callId: "c1" });

    return yield* Schema.decodeUnknownEffect(Schema.String)(output.result);
  });

/** The notices every before-call hook adds. */
const beforeCall = Effect.gen(function* () {
  const answers = yield* Effect.forEach(yield* (yield* BeforeCallHooks).list, (hook) =>
    hook({ sessionId, settings }),
  );

  return answers.flatMap((answer) =>
    BeforeCall.$match(answer, {
      Proceed: ({ input }) => input.map(({ text }) => text),
      EndTurn: () => [],
      Await: ({ input }) => input.map(({ text }) => text),
    }),
  );
});

/** The notices every turn-ending hook adds. */
const turnEnding = Effect.gen(function* () {
  const drafts = yield* Effect.forEach(yield* (yield* TurnEndingHooks).list, (hook) =>
    hook({ sessionId, settings }),
  );

  return drafts.flat().map(({ text }) => text);
});

effectTest(
  "commands start, list, stop and report their exits through the holder",
  Effect.gen(function* () {
    const quick = yield* call(processTools.start, { command: "echo hi", waitSeconds: 5 });

    expect(quick).toBe(
      "Command p1 (echo hi) exited with code 0.\nOutput since the last read:\nhi\n",
    );

    const long = yield* call(processTools.start, { command: "sleep 60", waitSeconds: 0.25 });
    expect(long).toStartWith("Command p2 (sleep 60) is running.");

    expect(yield* beforeCall).toEqual(["Still running: p2"]);
    expect(yield* beforeCall).toEqual([]);

    expect(yield* call(processTools.list, {})).toBe(
      "Command p1 (echo hi) exited with code 0.\nCommand p2 (sleep 60) is running.",
    );

    expect(yield* call(processTools.stop, { id: "p2" })).toBe("Command p2 (sleep 60) was stopped.");

    yield* call(processTools.start, { command: "sleep 0.3; exit 4", waitSeconds: 0.25 });
    yield* Effect.sleep("700 millis");

    expect(yield* turnEnding).toEqual(["Command p3 (sleep 0.3; exit 4) exited with code 4."]);
    expect(yield* turnEnding).toEqual([]);
  }).pipe(TestClock.withLive),
  stack,
);
