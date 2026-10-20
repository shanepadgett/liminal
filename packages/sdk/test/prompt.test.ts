/** Liminal messages as `effect/ai` prompt messages. */

import { expect } from "bun:test";

import { Effect } from "effect";

import { promptOf, toolkitOf } from "../src/ai/prompt.ts";
import { OpenAiPrompt } from "../src/ai/provider-prompt.ts";
import type { ModelContent, ModelTool, ToolSpec } from "../src/core/index.ts";
import { effectTest } from "../src/testing/effect-test.ts";
import { testBaseServices } from "../src/testing/index.ts";

const spec = (name: string): ToolSpec => ({ name, description: name, parameters: {} });

effectTest(
  "a user message's run of tool changes becomes one tools reminder",
  Effect.gen(function* () {
    const prompt = yield* promptOf(
      [
        {
          role: "user",
          parts: [
            { type: "text", text: "notes", providerData: {} },
            { type: "tool-change", change: "offer", tool: spec("read") },
            { type: "tool-change", change: "withdraw", tool: spec("write") },
          ],
        },
      ],
      OpenAiPrompt,
    );

    expect(prompt).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "notes" },
          {
            type: "text",
            text: [
              '<reminder kind="tools">',
              "The tool `read` is available from now on.",
              "The tool `write` is no longer available; do not call it.",
              "</reminder>",
            ].join("\n"),
          },
        ],
      },
    ]);
  }),
  testBaseServices,
);

const declared = (name: string, deferred: boolean): ModelTool => {
  const tool: ModelTool = {
    name,
    description: name,
    parameters: { type: "object", properties: {} },
    offered: true,
  };

  return deferred ? { ...tool, deferred: true } : tool;
};

const tools = [declared("read", false), declared("websearch", true), declared("webfetch", true)];

/** A tool message whose result loads `loads`. */
const loading = (loads: ReadonlyArray<string>): ModelContent => ({
  role: "tool",
  parts: [
    { type: "tool-result", callId: "c1", name: "tool_search", result: "", isFailure: false, loads },
  ],
});

effectTest(
  "deferred tools are sent once a result loads them",
  Effect.gen(function* () {
    const before = yield* toolkitOf(tools, [], "added");
    const after = yield* toolkitOf(tools, [loading(["websearch"])], "added");

    expect(Object.keys(before.tools)).toEqual(["read"]);
    expect(Object.keys(after.tools)).toEqual(["read", "websearch"]);
  }),
  testBaseServices,
);

effectTest(
  "a provider that withholds deferred tools itself gets every tool",
  Effect.gen(function* () {
    const toolkit = yield* toolkitOf(tools, [], "native");

    expect(Object.keys(toolkit.tools)).toEqual(["read", "websearch", "webfetch"]);
  }),
  testBaseServices,
);

const ask: ModelTool = { ...declared("ask_question", false), offered: false };

/** A user message that offers or withdraws `ask`. */
const changing = (change: "offer" | "withdraw"): ModelContent => ({
  role: "user",
  parts: [{ type: "tool-change", change, tool: ask }],
});

/** The names of the tools sent for `messages`. */
const sentFor = (messages: ReadonlyArray<ModelContent>) =>
  toolkitOf([declared("read", false), ask], messages, "added").pipe(
    Effect.map((toolkit) => Object.keys(toolkit.tools)),
  );

effectTest(
  "a tool not offered at the start is sent once an offer is in the messages, and after its withdrawal",
  Effect.gen(function* () {
    expect(yield* sentFor([])).toEqual(["read"]);
    expect(yield* sentFor([changing("offer")])).toEqual(["read", "ask_question"]);

    expect(yield* sentFor([changing("offer"), changing("withdraw")])).toEqual([
      "read",
      "ask_question",
    ]);
  }),
  testBaseServices,
);
