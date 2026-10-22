/** OpenAI's Chat Completions API through Effect AI, for every provider that speaks it. */
import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Effect } from "effect";

/** Where to send Chat Completions calls and how to sign them. */
export type ChatOptions = OpenAiClient.Options;

/** A model's thinking level, for one request. */
export interface ChatModelOptions {
  readonly thinking?: string | undefined;
}

/**
 * An Effect AI language model for `model` on a Chat Completions API. A thinking level is sent as
 * `reasoning_effort`, `off` as `none`; the API checks the level.
 */
export const chatModel = Effect.fn("chatModel")(function* (
  options: ChatOptions,
  model: string,
  { thinking }: ChatModelOptions,
) {
  const client = yield* OpenAiClient.make(options);

  // Our tool schemas are not written for strict mode, which refuses some JSON Schema keywords.
  const base = { strictJsonSchema: false };

  const config =
    thinking === undefined
      ? base
      : { ...base, reasoning_effort: thinking === "off" ? "none" : thinking };

  return yield* OpenAiLanguageModel.make({ model, config }).pipe(
    Effect.provideService(OpenAiClient.OpenAiClient, client),
  );
});
