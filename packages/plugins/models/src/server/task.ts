/** The task loop: calls the model until it submits an answer its schema accepts. */

import { Effect, Schema, Stream } from "effect";

import {
  type CheapModel,
  jsonSchemaOf,
  type ModelContent,
  type ModelPart,
  type ModelTool,
  type SessionId,
  type Tool,
  type ToolChoice,
} from "@liminal/sdk";

import { type Models, ModelTask, type TaskRequest, TaskFailed } from "../contract.ts";

/** A tool call the model made. */
interface Call {
  readonly id: string;
  readonly name: string;
  readonly params: Schema.Json;
}

/** One step's outcome: the answer, or the messages to add before the next step. */
type Step<A> =
  | { readonly type: "answer"; readonly value: A }
  | {
      readonly type: "continue";
      readonly added: ReadonlyArray<ModelContent>;
      readonly retry: boolean;
    };

/** A task with its submit tool's decoder and every tool the model sees. */
interface Prepared<A> {
  readonly model: CheapModel;
  readonly sessionId: SessionId;
  readonly tools: ReadonlyArray<Tool>;
  readonly submitName: string;
  readonly specs: ReadonlyArray<ModelTool>;
  readonly decode: (params: Schema.Json) => Effect.Effect<A, Schema.SchemaError>;
}

/** What one tool call answered, as the model sees it. */
const resultMessage = (call: Call, result: Schema.Json, isFailure: boolean): ModelContent => ({
  role: "tool",
  parts: [{ type: "tool-result", callId: call.id, name: call.name, result, isFailure }],
});

const callsOf = (parts: ReadonlyArray<ModelPart>): ReadonlyArray<Call> =>
  parts.flatMap((part) =>
    part.type === "tool-call" ? [{ id: part.id, name: part.name, params: part.params }] : [],
  );

/** Runs one call to a task tool; an unknown tool or a failed run is a failure result. */
const runCall = <A>(task: Prepared<A>, call: Call) => {
  const tool = task.tools.find((one) => one.spec.name === call.name);
  if (tool === undefined) return Effect.succeed(resultMessage(call, `no tool ${call.name}`, true));

  return tool.run(call.params, { sessionId: task.sessionId, callId: call.id }).pipe(
    Effect.map((output) => resultMessage(call, output.result, false)),
    Effect.catchTag("ToolFailed", (failed) =>
      Effect.succeed(resultMessage(call, failed.message, true)),
    ),
  );
};

/** The submitted answer; a rejected one fails, or once is sent back for another try. */
const answerOf = <A>(
  task: Prepared<A>,
  call: Call,
  parts: ReadonlyArray<ModelPart>,
  retried: boolean,
): Effect.Effect<Step<A>, TaskFailed> =>
  task.decode(call.params).pipe(
    Effect.map((value): Step<A> => ({ type: "answer", value })),
    Effect.catchTag("SchemaError", (error) => {
      const message = `invalid answer: ${error.message}`;
      if (retried) return Effect.fail(new TaskFailed({ message }));

      return Effect.succeed<Step<A>>({
        type: "continue",
        added: [{ role: "assistant", parts }, resultMessage(call, message, true)],
        retry: true,
      });
    }),
  );

const prepare = <S extends Schema.Top & { readonly DecodingServices: never }>(
  request: TaskRequest<S>,
): Prepared<S["Type"]> => {
  const { submit } = request;
  const decode = Schema.decodeUnknownEffect(Schema.toCodecJson(submit.schema));

  return {
    model: request.model,
    sessionId: request.sessionId,
    tools: request.tools,
    submitName: submit.name,
    specs: [
      ...request.tools.map((tool) => ({ ...tool.spec, offered: true })),
      {
        name: submit.name,
        description: submit.description,
        parameters: jsonSchemaOf(submit.schema),
        offered: true,
      },
    ],
    decode,
  };
};

export const make = (models: Models["Service"]) => {
  /** One model call: the answer, or the reply and tool results to send back. */
  const step = Effect.fn("ModelTask.step")(function* <A>(
    task: Prepared<A>,
    messages: ReadonlyArray<ModelContent>,
    retried: boolean,
    toolChoice: ToolChoice,
  ) {
    const parts = yield* Stream.runFold(
      models.stream({
        model: task.model.model,
        thinking: task.model.thinking,
        messages,
        tools: task.specs,
        toolChoice,
      }),
      (): Array<ModelPart> => [],
      (found, event) => (event.type === "part-end" ? [...found, event.part] : found),
    );

    const calls = callsOf(parts);
    if (calls.length === 0) return yield* new TaskFailed({ message: "the model called no tool" });

    const submitted = calls.find((call) => call.name === task.submitName);
    if (submitted !== undefined) return yield* answerOf(task, submitted, parts, retried);

    const results = yield* Effect.forEach(calls, (call) => runCall(task, call));

    const next: Step<A> = {
      type: "continue",
      added: [{ role: "assistant", parts }, ...results],
      retry: false,
    };

    return next;
  });

  const run = Effect.fn("ModelTask.run")(function* <
    S extends Schema.Top & { readonly DecodingServices: never },
  >(request: TaskRequest<S>) {
    const task = prepare(request);

    const messages: Array<ModelContent> = [
      { role: "system", parts: [{ type: "text", text: request.system, providerData: {} }] },
      ...request.prompt,
    ];

    let retried = false;

    for (let count = 1; count <= request.maxSteps; count += 1) {
      const last: boolean = count === request.maxSteps || retried;
      const choice: ToolChoice = last ? { tool: task.submitName } : "required";
      const outcome: Step<S["Type"]> = yield* step(task, [...messages], retried, choice);
      if (outcome.type === "answer") return outcome.value;

      messages.push(...outcome.added);
      retried ||= outcome.retry;
    }

    return yield* new TaskFailed({ message: `no answer in ${request.maxSteps} steps` });
  });

  return ModelTask.of({ run });
};
