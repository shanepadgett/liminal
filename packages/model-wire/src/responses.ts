/** OpenAI's Responses API through Effect AI, for every provider that speaks it. */
import { OpenAiClient, OpenAiLanguageModel, OpenAiSchema } from "@effect/ai-openai";
import { Effect, Schema } from "effect";
import { AiError } from "effect/ai";

/** Where to send Responses calls and how to sign them. */
export type ResponsesOptions = OpenAiClient.Options;

type Config = NonNullable<Parameters<typeof OpenAiLanguageModel.make>[0]["config"]>;

type Reasoning = NonNullable<typeof OpenAiSchema.CreateResponse.Encoded.reasoning>;

const isEffort = Schema.is(
  Schema.Literals(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
);

/** `off` is the API's `none`; any other level is an effort, with summaries of the reasoning. */
const reasoningOf = Effect.fn("reasoningOf")(function* (thinking: string) {
  const effort = thinking === "off" ? "none" : thinking;

  if (!isEffort(effort)) {
    return yield* AiError.make({
      module: "Responses",
      method: "languageModel",
      reason: new AiError.InvalidRequestError({
        parameter: "thinking",
        description: `Unknown thinking level ${thinking}. Use off, minimal, low, medium, high or xhigh.`,
      }),
    });
  }

  return { effort, summary: "auto" } satisfies Reasoning;
});

/** A model's thinking level and cache key, for one request. */
export interface ResponsesModelOptions {
  readonly thinking?: string | undefined;
  readonly cacheKey?: string | undefined;
}

/**
 * An Effect AI language model for `model` on a Responses API. Nothing is stored, so each request
 * carries the whole conversation and the encrypted reasoning comes back to be sent again.
 */
export const responsesModel = Effect.fn("responsesModel")(function* (
  options: ResponsesOptions,
  model: string,
  { thinking, cacheKey }: ResponsesModelOptions,
) {
  const client = yield* OpenAiClient.make(options);

  // Our tool schemas are not written for strict mode, which refuses some JSON Schema keywords.
  const base: Config = { store: false, strictJsonSchema: false };

  const withReasoning =
    thinking === undefined ? base : { ...base, reasoning: yield* reasoningOf(thinking) };

  const config =
    cacheKey === undefined ? withReasoning : { ...withReasoning, prompt_cache_key: cacheKey };

  return yield* OpenAiLanguageModel.make({ model, config }).pipe(
    Effect.provideService(OpenAiClient.OpenAiClient, client),
  );
});
