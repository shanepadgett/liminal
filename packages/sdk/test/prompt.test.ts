/** Liminal messages as `effect/ai` prompt messages. */

import { expect } from "bun:test";

import { Effect } from "effect";

import { promptOf } from "../src/ai/prompt.ts";
import { OpenAiPrompt } from "../src/ai/provider-prompt.ts";
import type { ToolSpec } from "../src/core/index.ts";
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
