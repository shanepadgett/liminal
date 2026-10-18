/**
 * `@liminal/sdk/ai/messages`: Anthropic's Messages API through `@effect/ai-anthropic`, one streamed
 * call per request. Needs `@effect/ai-anthropic`, an optional peer of the SDK.
 */

import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Effect, FileSystem, Match, Option, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import type { ModelError, ModelRequest, ThinkingValue } from "../core/index.ts";
import type { ProviderPrompt } from "./provider-prompt.ts";
import { replyOf } from "./reply.ts";

/** What `@effect/ai-anthropic` puts on reasoning parts: the signature, or the redacted thinking. */
const AnthropicData = Schema.Struct({
  anthropic: Schema.Struct({
    info: Schema.Union([
      Schema.Struct({ type: Schema.Literal("thinking"), signature: Schema.String }),
      Schema.Struct({ type: Schema.Literal("redacted_thinking"), redactedData: Schema.String }),
    ]),
  }),
});

/** Anthropic caches the prefix up to each marked block for five minutes. */
const AnthropicPrompt: ProviderPrompt = {
  data: AnthropicData,
  cache: Option.some({ anthropic: { cacheControl: { type: "ephemeral" } } }),
};

/**
 * Request fields as JSON: the package types `output_config.effort` as low, medium or high only, but
 * sends any value unchecked, and the catalog offers xhigh and max for the models that take them.
 */
type Fields = Readonly<Record<string, Schema.Json>>;

/**
 * `On` lets the model choose how much to think; an effort guides that choice; a budget fixes it.
 * The output limit must exceed the budget, so it is sent with it when the request sets one.
 */
const thinkingOf = (value: ThinkingValue, maxOutputTokens: number | undefined) =>
  Match.valueTags(value, {
    Off: (): Fields => ({ thinking: { type: "disabled" } }),
    On: (): Fields => ({ thinking: { type: "adaptive" } }),
    Effort: ({ effort }): Fields => ({ thinking: { type: "adaptive" }, output_config: { effort } }),
    Budget: ({ tokens }): Fields => {
      const thinking = { type: "enabled", budget_tokens: tokens };

      return maxOutputTokens === undefined
        ? { thinking }
        : { thinking, max_tokens: maxOutputTokens };
    },
  });

/** How one provider on a Messages API signs its calls. */
export interface MessagesSigning {
  /** The provider id, which keys the request's provider options. */
  readonly provider: string;
  /** The provider's name in errors. */
  readonly name: string;
  /** The client options for one call: key or headers, address, client changes. */
  readonly options: Effect.Effect<AnthropicClient.Options, ModelError>;
  /** Messages sent before the request's, such as an identity the signing requires. */
  readonly preamble: ModelRequest["messages"];
}

/** The `effect/ai` language model for `request`, signed as `signing` gives. */
const languageModel = (
  signing: MessagesSigning,
  http: HttpClient.HttpClient,
  request: ModelRequest,
) =>
  Effect.gen(function* () {
    const client = yield* AnthropicClient.make(yield* signing.options).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );

    return yield* AnthropicLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[signing.provider],
        ...thinkingOf(request.thinking, request.maxOutputTokens),
        strictJsonSchema: false,
      },
    }).pipe(Effect.provideService(AnthropicClient.AnthropicClient, client));
  });

/** Streams one Messages call per request, signed by `signing`. */
export const messagesStream =
  (http: HttpClient.HttpClient, fs: FileSystem.FileSystem, signing: MessagesSigning) =>
  (request: ModelRequest) =>
    replyOf(signing.name, AnthropicPrompt, languageModel(signing, http, request), {
      ...request,
      messages: [...signing.preamble, ...request.messages],
    }).pipe(Stream.provideService(FileSystem.FileSystem, fs));
