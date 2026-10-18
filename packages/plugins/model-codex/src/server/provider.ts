/** Provider `codex`: one streamed Responses call per request on the ChatGPT plan's Codex backend. */

import { Generated, OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Effect, FileSystem, Layer, Schema, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import type { ModelRequest } from "@liminal/sdk";
import { effortOf, OpenAiPrompt, planModels, replyOf } from "@liminal/sdk/ai";

import { codexProvider } from "../contract.ts";
import { checkLogin, makeSigner, type Signer } from "./auth.ts";
import { codexMethod } from "./login.ts";

export const apiUrl = "https://chatgpt.com/backend-api/codex";

/** The backend hides models newer than the client version it is sent; recent versions see all. */
const clientVersion = "0.200.0";

/** The plan's models as the backend lists them. */
const planOf = (http: HttpClient.HttpClient, sign: Signer) =>
  planModels(
    "Codex",
    HttpClientRequest.get(`${apiUrl}/models`, { urlParams: { client_version: clientVersion } }),
    http,
    sign(),
  );

/** The backend takes only efforts. */
const codexEffort = effortOf("Codex", Schema.is(Generated.ReasoningEffort), "none");

/** The `effect/ai` language model for `request`, signed for this call. */
const languageModel = (request: ModelRequest, http: HttpClient.HttpClient, sign: Signer) =>
  Effect.gen(function* () {
    const signer = yield* sign(request.cacheKey);
    const effort = yield* codexEffort(request.thinking);

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
  (request: ModelRequest) =>
    replyOf("Codex", OpenAiPrompt, languageModel(request, http, sign), request).pipe(
      Stream.provideService(FileSystem.FileSystem, fs),
    );

/**
 * Registers provider `codex` and its login; needs an `HttpClient`, which tests replace with
 * recordings.
 */
export const codexLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const store = yield* CredentialStore;
    const sign = makeSigner(store, http);

    yield* (yield* LoginMethods).register(codexMethod(http));

    yield* providers.register({
      id: codexProvider,
      name: "Codex",
      source: ModelSource.PlanCatalog({ catalogId: "openai", plan: planOf(http, sign) }),
      checkLogin: checkLogin(store),
      stream: makeStream(http, sign, fs),
      nativeToolChanges: false,
    });
  }),
);
