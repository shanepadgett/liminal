/** The `chatgpt` provider: OpenAI's API on the user's ChatGPT plan, signed by Sign in with ChatGPT. */
import { Crypto, Effect } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import {
  credentialSaved,
  Credentials,
  LoginMethods,
} from "@shanepadgett/liminal-accounts/contract";
import { responsesModel } from "@shanepadgett/liminal-model-wire/responses";
import { type LanguageModelOptions, ModelProviders } from "@shanepadgett/liminal-model/contract";

import { planModelInfo, planModels } from "../list.ts";
import { freshTokens } from "../sign.ts";
import { apiToolChanges } from "../tool-changes.ts";
import { refreshTokens, resource } from "./auth.ts";
import { makeHostId } from "./host-id.ts";
import { chatgptLogin } from "./login.ts";

export const registerChatgpt = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const credentials = yield* Credentials;
  const crypto = yield* Crypto.Crypto;
  const hostId = (yield* makeHostId).read;

  yield* (yield* LoginMethods).add(chatgptLogin({ client: http, credentials, crypto, hostId }));

  const tokens = freshTokens(
    credentials,
    { provider: "chatgpt", module: "ChatGPT", title: "ChatGPT" },
    refreshTokens(http),
  );

  // With a ChatGPT token the API lists the plan's models, as the Codex backend does.
  const models = Effect.gen(function* () {
    const request = HttpClientRequest.get(`${resource}/models`).pipe(
      HttpClientRequest.bearerToken((yield* tokens).access),
    );

    const listed = yield* planModels("ChatGPT", http, request);

    return listed.flatMap((model) =>
      model.supported_in_api === false ? [] : [planModelInfo("chatgpt", model)],
    );
  });

  const languageModel = Effect.fn("Chatgpt.languageModel")(function* (
    model: string,
    { thinking, cacheKey, toolChanges }: LanguageModelOptions,
  ) {
    const { access } = yield* tokens;

    return yield* withHttp(
      responsesModel({ apiUrl: resource, apiKey: access }, model, {
        thinking,
        cacheKey,
        toolChanges,
      }),
    );
  });

  yield* (yield* ModelProviders).add({
    id: "chatgpt",
    name: "ChatGPT",
    catalogId: "openai",
    defaults: { main: { model: "chatgpt/gpt-6.1-sol" }, small: { model: "chatgpt/gpt-6-luna" } },
    signedIn: credentialSaved(credentials, "chatgpt"),
    models,
    nativeToolChanges: apiToolChanges,
    languageModel,
  });
});
