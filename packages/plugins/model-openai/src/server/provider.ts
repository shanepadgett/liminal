/** Provider `openai`: one streamed Responses call per request, signed with the API key. */

import { Generated, OpenAiClient, OpenAiLanguageModel } from "@effect/ai-openai";
import { Effect, FileSystem, Layer, Option, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ModelError, type ModelRequest } from "@liminal/sdk";
import { effortOf, OpenAiPrompt, replyOf } from "@liminal/sdk/ai";

import { openAiKeyVariable, openAiLogin, openAiProvider } from "../contract.ts";

/** The API takes only efforts. */
const openAiEffort = effortOf("OpenAI", Schema.is(Generated.ReasoningEffort), "none");

const authError = (message: string) => new ModelError({ reason: "auth", message });

/** The saved key, else the one in `OPENAI_API_KEY`. */
const keyOf = (store: CredentialStore["Service"]) =>
  store.secret(openAiLogin, { env: openAiKeyVariable }).pipe(
    Effect.mapError((error) => authError(`OpenAI key could not be read: ${error.message}`)),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            authError(`No OpenAI API key: sign in with /connect or set ${openAiKeyVariable}`),
          ),
        onSome: Effect.succeed,
      }),
    ),
  );

/** The `effect/ai` language model for `request`. */
const languageModel = (
  request: ModelRequest,
  http: HttpClient.HttpClient,
  store: CredentialStore["Service"],
) =>
  Effect.gen(function* () {
    const apiKey = yield* keyOf(store);
    const effort = yield* openAiEffort(request.thinking);

    const client = yield* OpenAiClient.make({ apiKey }).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );

    // Liminal sends the whole conversation each time, so the API keeps nothing and the encrypted
    // reasoning comes back to be sent again; the cache key routes a conversation to its cache.
    return yield* OpenAiLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[openAiProvider],
        store: false,
        include: ["reasoning.encrypted_content"],
        prompt_cache_key: request.cacheKey,
        reasoning: { effort, summary: "auto" },
        strictJsonSchema: false,
      },
    }).pipe(Effect.provideService(OpenAiClient.OpenAiClient, client));
  });

/** Registers provider `openai` and its API key login; needs an `HttpClient`, which tests replace. */
export const openAiLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const logins = yield* LoginMethods;
    const store = yield* CredentialStore;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;

    yield* logins.register(
      LoginMethod.ApiKey({
        id: openAiLogin,
        vendor: { id: "openai", name: "OpenAI" },
        title: "API key",
        env: openAiKeyVariable,
      }),
    );

    yield* providers.register({
      id: openAiProvider,
      name: "OpenAI",
      source: ModelSource.Catalog({ catalogId: "openai" }),
      checkLogin: Effect.asVoid(keyOf(store)),
      stream: (request) =>
        replyOf("OpenAI", OpenAiPrompt, languageModel(request, http, store), request).pipe(
          Stream.provideService(FileSystem.FileSystem, fs),
        ),
      nativeToolChanges: false,
    });
  }),
);
