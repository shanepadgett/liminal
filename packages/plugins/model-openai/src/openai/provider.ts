/**
 * The `openai` provider: OpenAI's API, signed with the saved API key, else the key in
 * `OPENAI_API_KEY`. It offers GPT-6 Luna as a classifier.
 */
import { Effect, Schema } from "effect";
import { AiError } from "effect/ai";
import { HttpClient, HttpClientRequest } from "effect/http";

import {
  apiKeyLogin,
  apiKeyMethod,
  Credentials,
  LoginMethods,
} from "@shanepadgett/liminal-accounts/contract";
import { decisionsModel } from "@shanepadgett/liminal-model-wire/decisions";
import { responsesModel } from "@shanepadgett/liminal-model-wire/responses";
import {
  type LanguageModelOptions,
  ModelCatalog,
  ModelProviders,
} from "@shanepadgett/liminal-model/contract";

import { fetchList } from "../list.ts";
import { authFailed } from "../sign.ts";

const keyVariable = "OPENAI_API_KEY";

export const apiUrl = "https://api.openai.com/v1";

const ModelIds = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) });

/** The ids the API lists that the catalog lists as chat models, since the API says nothing of kind. */
const chatModels = Effect.fn("OpenAI.chatModels")(function* (
  catalog: ModelCatalog["Service"],
  listed: ReadonlyArray<string>,
) {
  const entries = yield* catalog
    .models("openai")
    .pipe(
      Effect.mapError((error) =>
        AiError.make({
          module: "OpenAI",
          method: "models",
          reason: new AiError.UnknownError({ description: error.message }),
        }),
      ),
    );

  const names = new Map(
    entries.flatMap((entry) => (entry.kind === "chat" ? [[entry.id, entry.name] as const] : [])),
  );

  return listed.flatMap((id) => {
    const name = names.get(id);

    return name === undefined ? [] : [{ id: `openai/${id}`, name }];
  });
});

export const registerOpenAi = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const credentials = yield* Credentials;
  const catalog = yield* ModelCatalog;
  const login = apiKeyLogin(credentials, "openai", keyVariable);

  /** The key to sign a call with, read on each call so a missing one fails the call. */
  const apiKey = Effect.catchTag(login.key, "CredentialsFailed", (error) =>
    authFailed("OpenAI", error.message),
  );

  yield* (yield* LoginMethods).add(apiKeyMethod("openai", "OpenAI"));

  const models = Effect.gen(function* () {
    const request = HttpClientRequest.get(`${apiUrl}/models`).pipe(
      HttpClientRequest.bearerToken(yield* apiKey),
    );

    const { data } = yield* fetchList("OpenAI", http, request, ModelIds);

    return yield* chatModels(
      catalog,
      data.map(({ id }) => id),
    );
  });

  const languageModel = Effect.fn("OpenAI.languageModel")(function* (
    model: string,
    { thinking, cacheKey }: LanguageModelOptions,
  ) {
    return yield* withHttp(
      responsesModel({ apiKey: yield* apiKey }, model, { thinking, cacheKey }),
    );
  });

  const decisionModel = Effect.fn("OpenAI.decisionModel")(function* (model: string) {
    return yield* withHttp(decisionsModel({ apiKey: yield* apiKey }, model));
  });

  yield* (yield* ModelProviders).add({
    id: "openai",
    name: "OpenAI",
    catalogId: "openai",
    defaults: { main: { model: "openai/gpt-6.1-sol" }, small: { model: "openai/gpt-6-luna" } },
    signedIn: login.signedIn,
    models,
    languageModel,
    // The Decisions API takes only API keys, so `chatgpt` and `codex` offer no classifier.
    classifiers: Effect.succeed([{ id: "openai/gpt-6-luna", name: "GPT-6 Luna" }]),
    decisionModel,
  });
});
