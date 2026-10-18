/**
 * `@liminal/sdk/ai/chat`: OpenAI-compatible Chat Completions through `@effect/ai-openai-compat`,
 * one streamed call per request. Needs `@effect/ai-openai-compat`, an optional peer of the SDK.
 */

import { OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai-compat";
import { Effect, FileSystem, Match, Option, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import type { ModelError, ModelRequest, ThinkingValue } from "../core/index.ts";
import type { ProviderPrompt } from "./provider-prompt.ts";
import { replyOf } from "./reply.ts";

/**
 * What `@effect/ai-openai-compat` puts on reasoning parts: the reply field the reasoning came
 * under, which it is sent back under, since some servers need it beside the tool calls it led to.
 */
const ChatData = Schema.Struct({
  "openai-compat": Schema.Struct({
    reasoningField: Schema.optionalKey(
      Schema.NullOr(Schema.Literals(["reasoning", "reasoning_content"])),
    ),
  }),
});

/** Chat servers cache on their own; marks are ignored. */
const ChatPrompt: ProviderPrompt = { data: ChatData, cache: Option.none() };

type Fields = Readonly<Record<string, Schema.Json>>;

/**
 * The fields compatible servers read: `reasoning_effort` for an effort, else a `thinking` switch
 * that may carry a budget.
 */
const thinkingOf = (value: ThinkingValue) =>
  Match.valueTags(value, {
    Off: (): Fields => ({ thinking: { type: "disabled" } }),
    On: (): Fields => ({ thinking: { type: "enabled" } }),
    Effort: ({ effort }): Fields => ({ reasoning_effort: effort }),
    Budget: ({ tokens }): Fields => ({ thinking: { type: "enabled", budget_tokens: tokens } }),
  });

/** How one provider on a Chat Completions API signs its calls. */
export interface ChatSigning {
  /** The provider id, which keys the request's provider options. */
  readonly provider: string;
  /** The provider's name in errors. */
  readonly name: string;
  /** The client options for one call: key, address, client changes. */
  readonly options: Effect.Effect<OpenAiClient.Options, ModelError>;
}

/** The `effect/ai` language model for `request`. */
const languageModel = (signing: ChatSigning, http: HttpClient.HttpClient, request: ModelRequest) =>
  Effect.flatMap(signing.options, (options) =>
    OpenAiLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[signing.provider],
        ...thinkingOf(request.thinking),
        strictJsonSchema: false,
      },
    }).pipe(
      Effect.provideServiceEffect(OpenAiClient.OpenAiClient, OpenAiClient.make(options)),
      Effect.provideService(HttpClient.HttpClient, http),
    ),
  );

/** Streams one Chat Completions call per request, signed by `signing`. */
export const chatStream =
  (http: HttpClient.HttpClient, fs: FileSystem.FileSystem, signing: ChatSigning) =>
  (request: ModelRequest) =>
    replyOf(signing.name, ChatPrompt, languageModel(signing, http, request), request).pipe(
      Stream.provideService(FileSystem.FileSystem, fs),
    );
