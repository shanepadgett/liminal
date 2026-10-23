/** The tool registry and the pipeline every tool call runs through. */
import { Effect, Layer } from "effect";

import { definePlugin, Pipeline, Registry } from "@shanepadgett/liminal-core";
import type { ToolResult } from "@shanepadgett/liminal-model/contract";
import { SessionLog } from "@shanepadgett/liminal-session/contract";

import {
  type Tool,
  ToolCall,
  type ToolCallRequest,
  type ToolContext,
  ToolProgress,
  Tools,
} from "./contract.ts";

const failed = (request: ToolCallRequest, message: string): ToolResult => ({
  type: "tool-result",
  callId: request.call.id,
  name: request.call.name,
  content: [{ type: "text", text: message }],
  isFailure: true,
});

/** What the call's tool knows about it; its progress is published to the call's session. */
const contextOf = (log: SessionLog["Service"], request: ToolCallRequest): ToolContext => ({
  session: request.session,
  callId: request.call.id,
  attributes: request.attributes,
  progress: (data) =>
    Effect.flatMap(ToolProgress.make({ callId: request.call.id, data }), (delta) =>
      log.publish(request.session, delta),
    ),
});

/** Runs the tool by the call's name; every way a call can go wrong becomes a failed result. */
const runTool = (tools: ReadonlyArray<Tool>, context: ToolContext, request: ToolCallRequest) => {
  const { call } = request;
  const tool = tools.findLast(({ name }) => name === call.name);
  if (tool === undefined) return Effect.succeed(failed(request, `No tool is named ${call.name}.`));

  return tool.run(call.params, context).pipe(
    Effect.map(({ content }): ToolResult => ({
      type: "tool-result",
      callId: call.id,
      name: call.name,
      content,
      isFailure: false,
    })),
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
    const log = yield* SessionLog;

    return yield* Pipeline.make((request: ToolCallRequest) =>
      Effect.flatMap(tools.list, (current) => runTool(current, contextOf(log, request), request)),
    );
  }),
);

export default definePlugin({
  name: "tools",
  provides: [Tools, ToolCall],
  requires: [SessionLog],
  layer: toolCall.pipe(Layer.provideMerge(Layer.effect(Tools, Registry.make<Tool>()))),
});
