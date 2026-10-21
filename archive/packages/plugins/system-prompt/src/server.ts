/** System-prompt's server: the base prompt as the first prompt section. */

import { Effect, Layer, Schema } from "effect";

import { definePromptSection, PromptSections } from "@liminal/context/contract";

import { basePrompt } from "./server/base.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sections = yield* PromptSections;

    yield* sections.register(
      definePromptSection<string>({
        key: "system-prompt/base",
        order: 0,
        codec: Schema.String,
        read: () => Effect.succeed({ type: "present", value: basePrompt }),
        render: {
          initial: (text) => text,
          changed: (_before, after) => `The base instructions changed. They are now:\n\n${after}`,
        },
      }),
    );
  }),
);
