/** Tools' server: the registry, the pipeline, the guidance section and the tool list for context. */

import { Effect, Layer } from "effect";

import { ToolSources } from "@liminal/context/contract";
import { KeyedRegistry, type ModelTool } from "@liminal/sdk";

import { Tools } from "./contract.ts";
import { guidance } from "./server/guidance.ts";
import { pipeline } from "./server/pipeline.ts";

/** Every registered tool, declared as offered at the start or not. */
const offers = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools;
    const sources = yield* ToolSources;

    yield* sources.register(
      Effect.map(tools.list, (all) =>
        all.map((tool): ModelTool => ({ ...tool.spec, offered: tool.offeredAtStart })),
      ),
      { order: 0 },
    );
  }),
);

export const layer = Layer.mergeAll(offers, guidance).pipe(
  Layer.provideMerge(pipeline),
  Layer.provideMerge(KeyedRegistry.layer(Tools, (tool) => tool.spec.name)),
);
