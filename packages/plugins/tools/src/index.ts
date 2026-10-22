/** The tool registry and the pipeline every tool call runs through. */
import { Effect, Layer } from "effect";

import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import type { ToolResult } from "@shanepadgett/liminal-model/contract";

import { type Tool, ToolCall, type ToolCallRequest, Tools } from "./contract.ts";

const failed = (request: ToolCallRequest, message: string): ToolResult => ({
  type: "tool-result",
  callId: request.call.id,
  name: request.call.name,
  result: message,
  isFailure: true,
});

/** Runs the tool by the call's name; every way a call can go wrong becomes a failed result. */
const runTool = (tools: ReadonlyArray<Tool>, request: ToolCallRequest) => {
  const { call } = request;
  const tool = tools.findLast(({ name }) => name === call.name);
  if (tool === undefined) return Effect.succeed(failed(request, `No tool is named ${call.name}.`));

  const context = { session: request.session, callId: call.id, attributes: request.attributes };

  return tool.run(call.params, context).pipe(
    Effect.map(({ result, loads }) => {
      const done: ToolResult = {
        type: "tool-result",
        callId: call.id,
        name: call.name,
        result,
        isFailure: false,
      };

      return loads === undefined ? done : { ...done, loads };
    }),
    Effect.catchTag("ToolFailed", (error) => Effect.succeed(failed(request, error.message))),
    Effect.catchDefect((defect) =>
      Effect.as(
        Effect.logError(`The ${call.name} tool crashed`, defect),
        failed(request, `The tool crashed: ${String(defect)}`),
      ),
    ),
  );
};

const toolCall = Layer.effect(
  ToolCall,
  Effect.gen(function* () {
    const tools = yield* Tools;

    return yield* Pipeline.make((request: ToolCallRequest) =>
      Effect.flatMap(tools.list, (current) => runTool(current, request)),
    );
  }),
);

export default definePlugin({
  name: "tools",
  provides: [Tools, ToolCall],
  requires: [],
  layer: toolCall.pipe(Layer.provideMerge(Layer.effect(Tools, Registry.make<Tool>()))),
});
