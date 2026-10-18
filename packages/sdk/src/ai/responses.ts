/**
 * `@liminal/sdk/ai/responses`: OpenAI's Responses API through `@effect/ai-openai`, one streamed
 * call per request. Needs `@effect/ai-openai`, an optional peer of the SDK.
 */

import { Generated, OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Effect, FileSystem, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import type { ModelError, ModelRequest } from "../core/index.ts";
import { effortOf } from "./effort.ts";
import { OpenAiPrompt } from "./provider-prompt.ts";
import { replyOf } from "./reply.ts";

const isEffort = Schema.is(Generated.ReasoningEffort);

/** How one provider on a Responses API signs its calls. */
export interface ResponsesSigning {
  /** The provider id, which keys the request's provider options. */
  readonly provider: string;
  /** The provider's name in errors. */
  readonly name: string;
  /** The client options for one call: key, address, client changes. */
  readonly options: Effect.Effect<OpenAiClient.Options, ModelError>;
}

/** The `effect/ai` language model for `request`; the API takes only efforts. */
const languageModel = (
  signing: ResponsesSigning,
  http: HttpClient.HttpClient,
  request: ModelRequest,
) =>
  Effect.gen(function* () {
    const effort = yield* effortOf(signing.name, isEffort, "none")(request.thinking);

    const client = yield* OpenAiClient.make(yield* signing.options).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );

    // Liminal sends the whole conversation each time, so the API keeps nothing and the encrypted
    // reasoning comes back to be sent again; the cache key routes a conversation to its cache.
    return yield* OpenAiLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[signing.provider],
        store: false,
        include: ["reasoning.encrypted_content"],
        prompt_cache_key: request.cacheKey,
        reasoning: { effort, summary: "auto" },
        strictJsonSchema: false,
      },
    }).pipe(Effect.provideService(OpenAiClient.OpenAiClient, client));
  });

/** Streams one Responses call per request, signed by `signing`. */
export const responsesStream =
  (http: HttpClient.HttpClient, fs: FileSystem.FileSystem, signing: ResponsesSigning) =>
  (request: ModelRequest) =>
    replyOf(signing.name, OpenAiPrompt, languageModel(signing, http, request), request).pipe(
      Stream.provideService(FileSystem.FileSystem, fs),
    );
