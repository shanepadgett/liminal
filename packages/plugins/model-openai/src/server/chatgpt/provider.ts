/** Provider `chatgpt`: the OpenAI API on the user's ChatGPT plan, signed by Sign in with ChatGPT. */

import { Duration, Effect, FileSystem, Layer, Redacted } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ThinkingOff } from "@liminal/sdk";
import { planModels } from "@liminal/sdk/ai";
import { type ResponsesSigning, responsesSearch, responsesStream } from "@liminal/sdk/ai/responses";
import { offerSearchers, providerSearcher } from "@liminal/tools-web/contract";

import { chatgptProvider } from "../../contract.ts";
import { accessOf, checkLogin, resource } from "./auth.ts";
import { makeChatgptMethod } from "./login.ts";

/** Registers provider `chatgpt` and its login; needs an `HttpClient`, which tests replace. */
export const chatgptLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const store = yield* CredentialStore;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const token = accessOf(store, http);

    const plan = planModels(
      "ChatGPT",
      HttpClientRequest.get(`${resource}/models`),
      http,
      Effect.map(token, (access) => HttpClientRequest.bearerToken(Redacted.value(access))),
    );

    const signing: ResponsesSigning = {
      provider: chatgptProvider,
      name: "ChatGPT",
      options: Effect.map(token, (apiKey) => ({ apiKey })),
    };

    yield* (yield* LoginMethods).register(yield* makeChatgptMethod);

    yield* providers.register({
      id: chatgptProvider,
      name: "ChatGPT",
      source: ModelSource.PlanCatalog({ catalogId: "openai", plan }),
      checkLogin: checkLogin(store),
      stream: responsesStream(http, fs, signing),
      nativeToolChanges: false,
      cheap: { id: "gpt-6-luna", thinking: ThinkingOff.make({}) },
      cacheLifetime: Duration.minutes(5),
    });

    yield* offerSearchers([
      providerSearcher("ChatGPT", responsesSearch(http, fs, signing, "gpt-6-luna")),
    ]);
  }),
);
