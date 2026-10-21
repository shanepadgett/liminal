/** Tool output: short output passes; long output is cut and saved whole to a private file. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Schema } from "effect";

import { defaultHints, Registry, SessionId, type Tool } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import { type ToolOutcome, ToolWrappers } from "@liminal/tools/contract";

import toolOutput from "../plugin.ts";

const stack = serverOf(toolOutput).pipe(
  Layer.provideMerge(Registry.layer(ToolWrappers)),
  Layer.provideMerge(testBaseServices),
);

const tool: Tool = {
  spec: { name: "sh", description: "", parameters: {} },
  offer: "start",
  guidance: [],
  hints: defaultHints,
  runAlongside: false,
  safeToRerun: false,
  run: () => Effect.succeed({ result: "" }),
};

const call = { sessionId: SessionId.make("s1"), callId: "c1", name: "sh", params: {} };

const wrapped = (outcome: ToolOutcome) =>
  Effect.gen(function* () {
    const [wrapper] = yield* (yield* ToolWrappers).list;
    if (wrapper === undefined) return yield* Effect.die("no wrapper registered");

    return yield* wrapper({ call, tool }, Effect.succeed(outcome));
  });

/** The text of a done outcome's result; any other outcome fails the test. */
const resultText = (outcome: ToolOutcome) =>
  outcome.status === "done"
    ? Schema.decodeUnknownEffect(Schema.String)(outcome.output.result).pipe(Effect.orDie)
    : Effect.die(`expected a done outcome, got ${outcome.status}`);

const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`);

effectTest(
  "short output and denials pass unchanged",
  Effect.gen(function* () {
    const done: ToolOutcome = { status: "done", output: { result: "ok" } };
    const denied: ToolOutcome = { status: "denied", message: lines(5000).join("\n") };

    expect(yield* wrapped(done)).toEqual(done);
    expect(yield* wrapped(denied)).toEqual(denied);
  }),
  stack,
);

effectTest(
  "long output keeps its first and last halves and names the file with the whole text",
  Effect.gen(function* () {
    const whole = lines(3000).join("\n");
    const outcome = yield* wrapped({ status: "done", output: { result: whole, details: 1 } });
    const text = yield* resultText(outcome);
    expect(outcome.status === "done" && outcome.output.details).toBe(1);
    expect(text.startsWith("line 1\n")).toBe(true);
    expect(text.endsWith("\nline 3000")).toBe(true);
    expect(text).not.toContain("line 1500\n");
    expect(text).toContain("[Output cut: 3,000 lines");

    const file = /saved at (?<file>\S+);/u.exec(text)?.groups?.["file"] ?? "";
    expect(file.endsWith("/tool-output/s1/c1.txt")).toBe(true);
    expect(yield* (yield* FileSystem.FileSystem).readFileString(file)).toBe(whole);
  }),
  stack,
);

effectTest(
  "a long failure message and a long JSON result are cut too",
  Effect.gen(function* () {
    const failed = yield* wrapped({ status: "failed", message: "x".repeat(60_000) });
    expect(failed.status !== "done" && failed.message.length).toBeLessThan(51_000);

    const json = yield* wrapped({ status: "done", output: { result: { lines: lines(3000) } } });
    expect(yield* resultText(json)).toContain("[Output cut:");
  }),
  stack,
);
