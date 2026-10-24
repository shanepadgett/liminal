/** `Models`: the `small` role, the model list and one-off calls. */
import { Duration, Effect, Option, Schema, Stream } from "effect";
import { AiError } from "effect/ai";

import type { Registry } from "@shanepadgett/liminal-core";
import type { Settings } from "@shanepadgett/liminal-settings/contract";

import { findModel } from "./call.ts";
import { makeClassify } from "./classify.ts";
import {
  type GenerateObjectOptions,
  type GenerateOptions,
  type ModelCall,
  type ModelChoice,
  type ModelId,
  ModelNotFound,
  type ModelProvider,
  type ModelRequest,
  Models,
  Reply,
  type StructuredOutput,
} from "./contract.ts";
import { ModelSetting } from "./setting.ts";
import { generateWithTools } from "./steps.ts";

/** A provider's cache lifetime when it does not declare one, as Anthropic's default. */
const DEFAULT_CACHE_LIFETIME = Duration.minutes(5);

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
  const resolve = Effect.fn("Models.resolve")(function* (model: string, main?: ModelId) {
    if (model !== "small") return { model } satisfies ModelChoice;

    const chosen = (yield* settings.get(ModelSetting)).small;
    if (chosen !== undefined) return chosen;

    const listed = yield* providers.list;
    const own = listed.find((each) => main?.startsWith(`${each.id}/`) === true);
    if (own !== undefined && (yield* own.signedIn)) return own.defaults.small;

    const signedIn = yield* Effect.findFirst(listed, (each) => each.signedIn);
    if (Option.isSome(signedIn)) return signedIn.value.defaults.small;

    return yield* new ModelNotFound({
      model,
      message: "No model provider is connected. Run liminal connect.",
    });
  });

  const choiceOf = ({ model, main, prefix }: GenerateOptions) =>
    model === undefined && prefix !== undefined
      ? Effect.succeed<ModelChoice>(
          prefix.thinking === undefined
            ? { model: prefix.model }
            : { model: prefix.model, thinking: prefix.thinking },
        )
      : resolve(model ?? "small", main);

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

  const cacheLifetime = Effect.fn("Models.cacheLifetime")(function* (model: ModelId) {
    const { provider } = yield* findModel(providers, model);

    return provider.cacheLifetime ?? DEFAULT_CACHE_LIFETIME;
  });

  return Models.of({
    resolve,
    ...lookups,
    cacheLifetime,
    generate: (options) => Effect.map(reply(options), Reply.message),
    generateObject,
    classify: makeClassify(providers, settings),
  });
};
