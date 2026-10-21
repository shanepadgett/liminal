/** Tool search's server: `tool_search` and the deferred tools section, ranked by the same use. */

import { Effect, Layer } from "effect";

import { PromptSections } from "@liminal/context/contract";
import { SessionLog } from "@liminal/session-log/contract";
import { Tools } from "@liminal/tools/contract";

import { deferredSection } from "./server/section.ts";
import { toolSearchToolOf } from "./server/tool.ts";
import { makeToolUse } from "./server/use.ts";

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools;
    const use = yield* makeToolUse(yield* SessionLog);

    yield* (yield* PromptSections).register(deferredSection(tools.list, use));
    yield* tools.register(toolSearchToolOf(tools.list, use));
  }),
);
