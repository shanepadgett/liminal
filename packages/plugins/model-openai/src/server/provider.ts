/** Provider `openai`: one streamed Responses call per request, signed with the API key. */

import { Effect, FileSystem, Layer } from "effect";
import { HttpClient } from "effect/http";

import { apiKeyOf, CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { responsesStream } from "@liminal/sdk/ai/responses";

import { openAiKeyVariable, openAiLogin, openAiProvider } from "../contract.ts";

/** Registers provider `openai` and its API key login; needs an `HttpClient`, which tests replace. */
export const openAiLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const logins = yield* LoginMethods;
    const store = yield* CredentialStore;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const key = apiKeyOf(store, { login: openAiLogin, env: openAiKeyVariable, name: "OpenAI" });

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
      checkLogin: Effect.asVoid(key),
      stream: responsesStream(http, fs, {
        provider: openAiProvider,
        name: "OpenAI",
        options: Effect.map(key, (apiKey) => ({ apiKey })),
      }),
      nativeToolChanges: false,
    });
  }),
);
