/** `Models`: the `small` role, the model list and one-off calls. */
import { Effect, Option, Schema, Stream } from "effect";
import { AiError } from "effect/ai";

import type { Registry } from "@shanepadgett/liminal-core";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import { makeClassify } from "./classify.ts";
import {
  type GenerateObjectOptions,
  type GenerateOptions,
  type ModelCall,
  type ModelChoice,
  ModelNotFound,
  type ModelProvider,
  type ModelRequest,
  Models,
  Reply,
  type StructuredOutput,
} from "./contract.ts";
import { ModelSetting } from "./setting.ts";
import { generateWithTools } from "./steps.ts";

/** The reply's text, which holds the JSON of a structured output. */
const textOf = (reply: Reply) =>
  reply.flatMap(({ part }) => (part.type === "text" ? [part.text] : [])).join("");

/** The prefix and prompt as one request on `choice`; tools stay for the cache but go unused. */
const requestOf = (
  choice: ModelChoice,
  { prefix, system, prompt }: GenerateOptions,
  output: StructuredOutput | undefined,
): ModelRequest => {
  const tools = prefix?.tools ?? [];

  return {
    model: choice.model,
    thinking: choice.thinking,
    system: system ?? prefix?.system ?? "",
    tools,
    messages: [...(prefix?.messages ?? []), { role: "user", parts: prompt }],
    toolChoice: tools.length === 0 ? undefined : "none",
    output,
    cacheKey: prefix?.cacheKey,
  };
};

const decodeOutput = <T>(schema: Schema.Codec<T, Schema.JsonObject>, text: string) =>
  Schema.decodeEffect(Schema.fromJsonString(schema))(text).pipe(
    Effect.mapError((error) =>
      AiError.make({
        module: "Models",
        method: "generateObject",
        reason: AiError.StructuredOutputError.fromSchemaError(error, text),
      }),
    ),
  );

export const make = (
  providers: Registry<ModelProvider>,
  settings: Settings["Service"],
  call: ModelCall["Service"],
  lookups: Pick<Models["Service"], "list" | "details">,
) => {
  const resolve = Effect.fn("Models.resolve")(function* (model: string) {
    if (model !== "small") return { model } satisfies ModelChoice;

    const chosen = (yield* settings.get(ModelSetting)).small;
    if (chosen !== undefined) return chosen;

    const signedIn = yield* Effect.findFirst(yield* providers.list, (each) => each.signedIn);
    if (Option.isSome(signedIn)) return signedIn.value.defaults.small;

    return yield* new ModelNotFound({
      model,
      message: "No model provider is connected. Run liminal connect.",
    });
  });

  const choiceOf = ({ model, prefix }: GenerateOptions) =>
    model === undefined && prefix !== undefined
      ? Effect.succeed<ModelChoice>(
          prefix.thinking === undefined
            ? { model: prefix.model }
            : { model: prefix.model, thinking: prefix.thinking },
        )
      : resolve(model ?? "small");

  const reply = (options: GenerateOptions, output?: StructuredOutput) =>
    Effect.flatMap(choiceOf(options), (choice) =>
      Effect.flatMap(call.run(requestOf(choice, options, output)), (stream) =>
        Stream.runFold(stream, () => Reply.empty, Reply.add),
      ),
    );

  const generateObject = <T>(options: GenerateObjectOptions<T>) => {
    const { tools } = options;

    if (tools !== undefined && tools.length > 0) {
      return Effect.flatMap(choiceOf(options), (choice) =>
        generateWithTools(call, choice, { ...options, tools }),
      );
    }

    return Effect.flatMap(reply(options, { name: "output", schema: options.schema }), (built) =>
      decodeOutput(options.schema, textOf(built)),
    );
  };

  return Models.of({
    resolve,
    ...lookups,
    generate: (options) => Effect.map(reply(options), Reply.message),
    generateObject,
    classify: makeClassify(providers, settings),
  });
};
