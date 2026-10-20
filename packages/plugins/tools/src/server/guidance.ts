/** The guidance section: the guidance lines of the tools offered at the start, each once. */

import { Effect, Layer } from "effect";

import {
  definePromptSection,
  Lines,
  linesRender,
  PromptSections,
  type SectionRead,
} from "@liminal/context/contract";

import { Tools } from "../contract.ts";

export const guidance = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools;
    const sections = yield* PromptSections;

    yield* sections.register(
      definePromptSection<Lines>({
        key: "tools/guidance",
        order: 50,
        codec: Lines,
        read: () =>
          Effect.map(tools.list, (all): SectionRead<Lines> => ({
            type: "present",
            value: [
              ...new Set(all.flatMap((tool) => (tool.offer === "start" ? tool.guidance : []))),
            ],
          })),
        render: linesRender({
          tag: "tool_rules",
          added: "New tool guidance:",
          removed: "No longer applies:",
        }),
      }),
    );
  }),
);
