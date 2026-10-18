/** Tool-guidance's server: one prompt section with the guidance of every registered tool. */

import { Effect, Layer } from "effect";

import {
  definePromptSection,
  Lines,
  linesRender,
  PromptSections,
  type SectionRead,
} from "@liminal/context/contract";
import { Tools } from "@liminal/tool-registry/contract";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools;
    const sections = yield* PromptSections;

    yield* sections.register(
      definePromptSection<Lines>({
        key: "tool-guidance/rules",
        order: 50,
        codec: Lines,
        read: () =>
          Effect.map(tools.list, (all): SectionRead<Lines> => ({
            type: "present",
            value: [...new Set(all.flatMap((tool) => tool.guidance))],
          })),
        render: linesRender({
          initial: "Using tools:",
          added: "New tool guidance:",
          removed: "No longer applies:",
        }),
      }),
    );
  }),
);
