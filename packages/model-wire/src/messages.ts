/** Anthropic's Messages API through Effect AI, for every provider that speaks it. */
import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Effect } from "effect";
import { AiError } from "effect/ai";

/** Where to send Messages calls and how to sign them. */
export type MessagesOptions = AnthropicClient.Options;

type Config = NonNullable<Parameters<typeof AnthropicLanguageModel.make>[0]["config"]>;

/**
 * `off` turns thinking off; any other level is an effort the model thinks up to. Effect AI types
 * effort as low, medium or high only, but the API also takes `max` and sends the value unchecked.
 */
const thinkingConfigOf = (thinking: string | undefined): Config => {
  // Our tool schemas are not written for strict mode, which refuses some JSON Schema keywords.
  const strictJsonSchema = false;

  if (thinking === undefined) return { strictJsonSchema };
  if (thinking === "off") return { strictJsonSchema, thinking: { type: "disabled" } };

  return {
    strictJsonSchema,
    thinking: { type: "adaptive" },
    // eslint-disable-next-line typescript/no-unsafe-type-assertion -- the API checks the level and an unknown one fails the call with its message; Effect AI's type leaves out `max`.
    output_config: { effort: thinking as "high" },
  };
};

/** A model's thinking level and output limit; a missing limit leaves Effect AI to guess it. */
export interface MessagesModelOptions {
  readonly thinking?: string | undefined;
  readonly outputLimit?: number | undefined;
}

/** An Effect AI language model for `model` on a Messages API. */
export const messagesModel = Effect.fn("messagesModel")(function* (
  options: MessagesOptions,
  model: string,
  { thinking, outputLimit }: MessagesModelOptions,
) {
  const client = yield* AnthropicClient.make(options);
  const thinkingConfig = thinkingConfigOf(thinking);

  const config: Config =
    outputLimit === undefined ? thinkingConfig : { ...thinkingConfig, max_tokens: outputLimit };

  return yield* AnthropicLanguageModel.make({ model, config }).pipe(
    Effect.provideService(AnthropicClient.AnthropicClient, client),
  );
});

/** The most models the API lists in one page, more than it offers. */
const pageSize = 1000;

const failed = (reason: AiError.AiErrorReason) =>
  Effect.fail(AiError.make({ module: "Messages", method: "models", reason }));

/** The models a Messages API offers, by id and display name. */
export const messagesModels = Effect.fn("messagesModels")(function* (options: MessagesOptions) {
  const client = yield* AnthropicClient.make(options);

  const page = yield* client.client
    .modelsList({ params: { limit: pageSize } })
    .pipe(
      Effect.catchTags({
        ModelsList4XX: (error) =>
          failed(
            AiError.reasonFromHttpStatus({
              status: error.response.status,
              description: error.cause.error.message,
            }),
          ),
        HttpClientError: (error) =>
          failed(new AiError.UnknownError({ description: error.message })),
        SchemaError: (error) => failed(new AiError.UnknownError({ description: error.message })),
      }),
    );

  return page.data.map((model) => ({ id: model.id, name: model.display_name }));
});
