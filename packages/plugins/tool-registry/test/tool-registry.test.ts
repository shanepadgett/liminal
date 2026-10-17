/** Tools: declared params checked before a run, MCP default hints, and the newest build per name. */

import { expect } from "bun:test";

import { Effect, Exit, Layer, Option, Schema, Scope } from "effect";

import { SessionId } from "@liminal/sdk";
import { effectTest, testPlugin } from "@liminal/sdk/testing";

import toolRegistry from "../plugin.ts";
import { defaultHints, defineTool, Tools } from "../src/contract.ts";

const echo = (description: string) =>
  defineTool({
    name: "echo",
    description,
    parameters: Schema.Struct({ text: Schema.String }),
    hints: { readOnlyHint: true },
    runAlongside: true,
    safeToRerun: true,
    run: ({ text }) => Effect.succeed({ result: text }),
  });

const context = { sessionId: SessionId.make("s1"), callId: "c1" };

effectTest(
  "a tool checks its params and declares their JSON Schema",
  Effect.gen(function* () {
    const tool = echo("Echoes text");

    expect(tool.spec.parameters).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    });

    expect(tool.hints).toEqual({ ...defaultHints, readOnlyHint: true });
    expect(tool.offeredAtStart).toBe(true);

    expect(yield* tool.run({ text: "hi" }, context)).toEqual({ result: "hi" });
    const failed = yield* Effect.flip(tool.run({ text: 3 }, context));
    expect(failed.message).toStartWith("invalid params");
  }),
  Layer.empty,
);

effectTest(
  "the newest registration under a name wins until its scope closes",
  Effect.gen(function* () {
    const tools = yield* Tools;
    yield* tools.register(echo("old"));
    const newer = yield* Scope.make();
    yield* Scope.provide(tools.register(echo("new")), newer);

    const described = Effect.map(
      tools.get("echo"),
      Option.map((tool) => tool.spec.description),
    );

    expect(yield* described).toEqual(Option.some("new"));
    expect((yield* tools.list).length).toBe(1);

    yield* Scope.close(newer, Exit.void);
    expect(yield* described).toEqual(Option.some("old"));
  }),
  testPlugin(toolRegistry, Layer.empty),
);
