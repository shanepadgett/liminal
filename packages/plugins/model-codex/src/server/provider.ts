/** Provider `codex`: one streamed Responses call per request on the ChatGPT plan's Codex backend. */

import { Generated, OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Effect, FileSystem, Layer, Predicate, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import { CredentialStore } from "@liminal/credential-store/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ModelError, type ModelEvent, type ModelRequest, type ThinkingValue } from "@liminal/sdk";

import { codexProvider } from "../contract.ts";
import { makeSigner, type Signer } from "./auth.ts";
import { toModelError } from "./errors.ts";
import { check, noProgress, translate } from "./events.ts";
import { readPlan } from "./plan.ts";
import { promptOf, toolkitOf } from "./prompt.ts";

export const apiUrl = "https://chatgpt.com/backend-api/codex";

const isEffort = Schema.is(Generated.ReasoningEffort);
const none: Generated.ReasoningEffort = "none";

/** The effort the backend takes; it takes only efforts, so `On`, a budget or an unknown effort fail. */
const effortOf = Effect.fn("codex.effortOf")(function* (thinking: ThinkingValue) {
  if (Predicate.isTagged(thinking, "Off")) return none;
  if (Predicate.isTagged(thinking, "Effort") && isEffort(thinking.effort)) return thinking.effort;

  return yield* new ModelError({
    reason: "invalid-request",
    message: `Codex takes no thinking ${JSON.stringify(thinking)}`,
  });
});

const start: ModelEvent = { type: "start" };

/** The `effect/ai` language model for `request`, signed for this call. */
const languageModel = (request: ModelRequest, http: HttpClient.HttpClient, sign: Signer) =>
  Effect.gen(function* () {
    const signer = yield* sign(request.cacheKey);
    const effort = yield* effortOf(request.thinking);

    const client = yield* OpenAiClient.make({
      apiUrl,
      transformClient: HttpClient.mapRequest(signer),
    }).pipe(Effect.provideService(HttpClient.HttpClient, http));

    // The backend keeps nothing, so each request carries the whole conversation and the encrypted
    // reasoning comes back to be sent again; the cache key routes a conversation to its cache.
    return yield* OpenAiLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[codexProvider],
        store: false,
        include: ["reasoning.encrypted_content"],
        prompt_cache_key: request.cacheKey,
        reasoning: { effort, summary: "auto" },
        strictJsonSchema: false,
      },
    }).pipe(Effect.provideService(OpenAiClient.OpenAiClient, client));
  });

const makeStream =
  (http: HttpClient.HttpClient, sign: Signer, fs: FileSystem.FileSystem) =>
  (request: ModelRequest): Stream.Stream<ModelEvent, ModelError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const model = yield* languageModel(request, http, sign);

        const prompt = yield* promptOf(request.messages).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
        );

        const toolkit = yield* toolkitOf(request.tools);

        return model
          .streamText({
            prompt,
            toolkit,
            disableToolCallResolution: true,
            toolCallValidation: "deferred",
          })
          .pipe(Stream.mapError(toModelError));
      }),
    ).pipe(
      Stream.mapEffect(check),
      Stream.mapAccum(() => noProgress, translate),
      Stream.prepend([start]),
    );

/** Registers provider `codex`; needs an `HttpClient`, which tests replace with recordings. */
export const codexLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const sign = makeSigner(yield* CredentialStore, http);

    yield* providers.register({
      id: codexProvider,
      name: "Codex",
      source: ModelSource.PlanCatalog({ catalogId: "openai", plan: readPlan(apiUrl, http, sign) }),
      stream: makeStream(http, sign, fs),
      nativeToolChanges: false,
    });
  }),
);
