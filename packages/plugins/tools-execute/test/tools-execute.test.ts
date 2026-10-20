/**
 * The execute tool: a script calls the other tools through the pipeline as inner calls, each saved
 * for the transcript; checks judge each inner call; a failing script fails the call.
 */

import { expect } from "bun:test";

import { Effect, Layer, Option, Schema } from "effect";

import { PromptSections, ToolSources } from "@liminal/context/contract";
import { defineTool, KeyedRegistry, Registry, SessionId, ToolFailed } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import { InnerCallEntry, SessionLog } from "@liminal/session-log/contract";
import sessionStore from "@liminal/session-store";
import tools from "@liminal/tools";
import {
  type ToolCall,
  ToolChecks,
  ToolDecision,
  ToolPipeline,
  Tools,
} from "@liminal/tools/contract";

import toolsExecute from "../plugin.ts";

const stack = serverOf(toolsExecute).pipe(
  Layer.provideMerge(serverOf(tools)),
  Layer.provideMerge(serverOf(sessionLog)),
  Layer.provideMerge(serverOf(sessionStore)),
  Layer.provideMerge(
    Layer.mergeAll(
      KeyedRegistry.layer(PromptSections, (section) => section.key),
      Registry.layer(ToolSources),
    ),
  ),
  Layer.provideMerge(testBaseServices),
);

const s1 = SessionId.make("s1");

const upper = defineTool({
  name: "upper",
  description: "Upper-cases text.",
  parameters: Schema.Struct({ text: Schema.String }),
  runAlongside: true,
  safeToRerun: true,
  run: ({ text }) =>
    text === "boom"
      ? Effect.fail(new ToolFailed({ message: "no booms" }))
      : Effect.succeed({ result: text.toUpperCase() }),
});

/** Registers `upper` and creates the session. */
const setup = Effect.gen(function* () {
  yield* (yield* Tools).register(upper);
  yield* (yield* SessionLog).create(s1);
});

/** Runs `code` as the model's call `c1` and returns its outcome. */
const executeScript = (code: string) =>
  Effect.gen(function* () {
    const registry = yield* Tools;

    const call: ToolCall = {
      sessionId: s1,
      callId: "c1",
      name: "execute",
      params: { code, timeout: 60 },
    };

    return yield* (yield* ToolPipeline).run(call, yield* registry.get("execute"));
  });

const innerEntries = Effect.gen(function* () {
  const entries = yield* (yield* SessionLog).read(s1, {});

  return entries.flatMap((entry) =>
    entry.kind === InnerCallEntry.kind
      ? [Schema.decodeUnknownSync(InnerCallEntry.data)(entry.data)]
      : [],
  );
});

effectTest(
  "a script chains tool calls and returns what it printed and returned",
  Effect.gen(function* () {
    yield* setup;

    const outcome = yield* executeScript(
      [
        'const a = await tools.upper({ text: "one" })',
        'const [b, c] = await Promise.all([tools.upper({ text: "two" }), tools.upper({ text: "x" })])',
        "console.log(a)",
        "return [b, c].join('+')",
      ].join("\n"),
    );

    expect(outcome).toEqual({ status: "done", output: { result: "ONE\nTWO+X" } });

    const inner = yield* innerEntries;
    expect(inner.map((entry) => entry.outer)).toEqual(["c1", "c1", "c1"]);
    expect(inner.map((entry) => entry.id).toSorted()).toEqual(["c1/1", "c1/2", "c1/3"]);
    expect(inner[0]).toMatchObject({ name: "upper", params: { text: "one" }, status: "done" });
  }).pipe(Effect.scoped),
  stack,
);

effectTest(
  "checks stay directly callable but are absent from scripts and search",
  Effect.gen(function* () {
    yield* setup;
    const registry = yield* Tools;

    yield* registry.register(
      defineTool({
        runAlongside: false,
        safeToRerun: true,
        name: "checks",
        description: "Checks the project.",
        parameters: Schema.Struct({ text: Schema.String }),
        run: ({ text }) => Effect.succeed({ result: text }),
      }),
    );

    const searched = yield* executeScript('return search({ query: "checks" })');
    expect(searched.status).toBe("done");

    expect(searched.status === "done" && JSON.stringify(searched.output.result)).not.toContain(
      "checks",
    );

    const nested = yield* executeScript('return await tools.checks({ text: "checked" })');
    expect(nested.status).toBe("failed");
    expect(yield* innerEntries).toEqual([]);

    const direct = yield* (yield* ToolPipeline).run(
      { sessionId: s1, callId: "c2", name: "checks", params: { text: "checked" } },
      yield* registry.get("checks"),
    );

    expect(direct).toEqual({ status: "done", output: { result: "checked" } });
  }).pipe(Effect.scoped),
  stack,
);

effectTest(
  "a failed inner call throws in the script, and an uncaught one fails the call",
  Effect.gen(function* () {
    yield* setup;

    const caught = yield* executeScript(
      'try { await tools.upper({ text: "boom" }) } catch (e) { return "caught: " + e.message }',
    );

    expect(caught.status).toBe("done");
    expect(caught.status === "done" && JSON.stringify(caught.output.result)).toContain("no booms");

    const thrown = yield* executeScript('await tools.upper({ text: "boom" })');
    expect(thrown.status).toBe("failed");
  }).pipe(Effect.scoped),
  stack,
);

effectTest(
  "checks judge each inner call, and it knows its outer call",
  Effect.gen(function* () {
    yield* setup;
    const seen: Array<string> = [];

    yield* (yield* ToolChecks).register(
      (call) => {
        seen.push(`${call.name}:${call.outer ?? "-"}`);

        return Effect.succeed(
          call.name === "upper" ? ToolDecision.Deny({ reason: "not today" }) : ToolDecision.Allow(),
        );
      },
      { order: 0 },
    );

    const outcome = yield* executeScript('return await tools.upper({ text: "a" })');

    expect(seen).toEqual(["execute:-", "upper:c1"]);
    expect(outcome.status).toBe("failed");
    expect(outcome.status === "failed" && outcome.message).toContain("not today");

    const [inner] = yield* innerEntries;
    expect(Option.fromUndefinedOr(inner?.status)).toEqual(Option.some("denied"));
  }).pipe(Effect.scoped),
  stack,
);
