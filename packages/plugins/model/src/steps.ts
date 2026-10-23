/**
 * `generateObject` with tools: the schema becomes an `answer` tool, every step must call a tool,
 * and tool results go back to the model until an answer decodes or the steps run out.
 */
import { Effect, Option, Schema, Stream } from "effect";
import { AiError, Tool as AiTool } from "effect/ai";

import {
  type GenerateObjectOptions,
  type Message,
  type ModelCall,
  type ModelCallError,
  type ModelChoice,
  type ModelRequest,
  Reply,
  type StepTool,
  type ToolCall,
  type ToolResult,
} from "./contract.ts";

const ANSWER = "answer";
const DEFAULT_STEPS = 6;
const NO_CALL = `Call a tool. When you know enough, call \`${ANSWER}\`.`;

const resultOf = (call: ToolCall, text: string, isFailure: boolean): ToolResult => ({
  type: "tool-result",
  callId: call.id,
  name: call.name,
  content: [{ type: "text", text }],
  isFailure,
});

const exhausted = (steps: number) =>
  AiError.make({
    module: "Models",
    method: "generateObject",
    reason: new AiError.StructuredOutputError({
      description: `No answer that decodes within ${steps} steps.`,
      responseText: "",
    }),
  });

/** Runs `options.tools` until the model answers; `choice` is the model every step uses. */
export const generateWithTools = <T>(
  call: ModelCall["Service"],
  choice: ModelChoice,
  options: GenerateObjectOptions<T> & { readonly tools: ReadonlyArray<StepTool> },
) => {
  const { schema, tools, prefix } = options;
  const steps = options.maxSteps ?? DEFAULT_STEPS;
  const decode = Schema.decodeUnknownOption(schema);
  const check = Schema.decodeUnknownEffect(schema);

  const answer = {
    name: ANSWER,
    description: "Give your final answer. Call it once you know enough; it ends the task.",
    input: Schema.decodeUnknownSync(Schema.JsonObject)(AiTool.getJsonSchemaFromSchema(schema)),
  };

  const requestOf = (messages: ReadonlyArray<Message>): ModelRequest => ({
    model: choice.model,
    thinking: choice.thinking,
    system: options.system ?? prefix?.system ?? "",
    tools: [...tools.map(({ definition }) => definition), answer],
    messages,
    toolChoice: "required",
  });

  const run = (toolCall: ToolCall): Effect.Effect<ToolResult> => {
    if (toolCall.name === ANSWER) {
      return check(toolCall.params).pipe(
        Effect.match({
          onFailure: (error) =>
            resultOf(toolCall, `The answer does not fit: ${error.message}`, true),
          onSuccess: () => resultOf(toolCall, "Answered.", false),
        }),
      );
    }

    const tool = tools.find(({ definition }) => definition.name === toolCall.name);

    if (tool === undefined)
      return Effect.succeed(resultOf(toolCall, `No tool ${toolCall.name}.`, true));

    return Effect.map(tool.run(toolCall.params), (text) => resultOf(toolCall, text, false));
  };

  const step = (
    messages: ReadonlyArray<Message>,
    taken: number,
  ): Effect.Effect<T, ModelCallError> =>
    Effect.gen(function* () {
      if (taken === steps) return yield* exhausted(steps);

      const stream = yield* call.run(requestOf(messages));
      const reply = Reply.message(yield* Stream.runFold(stream, () => Reply.empty, Reply.add));
      const calls = reply.parts.flatMap((part) => (part.type === "tool-call" ? [part] : []));

      const answered = calls
        .flatMap(({ name, params }) => (name === ANSWER ? [decode(params)] : []))
        .find(Option.isSome);

      if (answered !== undefined) return answered.value;

      const results = yield* Effect.forEach(calls, run, { concurrency: "unbounded" });

      const next: Message =
        results.length === 0
          ? { role: "user", parts: [{ type: "text", text: NO_CALL }] }
          : { role: "tool", parts: results };

      return yield* step([...messages, reply, next], taken + 1);
    });

  return step([...(prefix?.messages ?? []), { role: "user", parts: options.prompt }], 0);
};
