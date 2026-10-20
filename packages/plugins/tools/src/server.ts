/** Tools' server: the registry, the pipeline, the guidance section and the tool list for context. */

import { Effect, Layer, Match } from "effect";

import { ToolSources } from "@liminal/context/contract";
import { KeyedRegistry, type ModelTool, type Tool } from "@liminal/sdk";

import { Tools } from "./contract.ts";
import { guidance } from "./server/guidance.ts";
import { pipeline } from "./server/pipeline.ts";

/**
 * The request's declaration of `tool`: a plugin's tool waits for its offer; a search tool waits for
 * a load.
 */
const declared = (tool: Tool): ModelTool =>
  Match.value(tool.offer).pipe(
    Match.when("start", (): ModelTool => ({ ...tool.spec, offered: true })),
    Match.when("search", (): ModelTool => ({ ...tool.spec, offered: true, deferred: true })),
    Match.when("plugin", (): ModelTool => ({ ...tool.spec, offered: false })),
    Match.exhaustive,
  );

/** Every registered tool, declared as its offer says. */
const offers = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools;
    const sources = yield* ToolSources;

    yield* sources.register(
      Effect.map(tools.list, (all) => all.map(declared)),
      { order: 0 },
    );
  }),
);

export const layer = Layer.mergeAll(offers, guidance).pipe(
  Layer.provideMerge(pipeline),
  Layer.provideMerge(KeyedRegistry.layer(Tools, (tool) => tool.spec.name)),
);
