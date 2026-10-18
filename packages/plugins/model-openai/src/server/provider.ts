/** Provider `openai`: one streamed Responses call per request, signed with the API key. */

import { Effect, FileSystem, Layer, Option } from "effect";
import { HttpClient } from "effect/http";

import { apiKeyOf, CredentialStore } from "@liminal/credential-store/contract";
import { DecisionModels } from "@liminal/decisions/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ThinkingOff } from "@liminal/sdk";
import { openAiDecisions } from "@liminal/sdk/ai/decisions";
import { responsesStream } from "@liminal/sdk/ai/responses";

import { openAiKeyVariable, openAiLogin, openAiProvider } from "../contract.ts";

/**
 * Registers provider `openai`, its API key login, and Luna Decisions when decisions is loaded;
 * needs an `HttpClient`, which tests replace.
 */
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
      cheap: { id: "gpt-6-luna", thinking: ThinkingOff.make({}) },
    });

    const decisionModels = yield* Effect.serviceOption(DecisionModels);

    if (Option.isSome(decisionModels))
      yield* decisionModels.value.register({
        id: "openai/luna",
        family: "luna",
        available: Effect.isSuccess(key),
        classify: openAiDecisions(http, {
          url: "https://api.openai.com/v1/decisions",
          key,
          model: "gpt-6-luna",
        }),
      });
  }),
);
