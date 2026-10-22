/**
 * The `openai` provider: OpenAI's API, signed with the saved API key, else the key in
 * `OPENAI_API_KEY`. It offers GPT-6 Luna as a classifier.
 */
import { Config, Effect, Option, Schema } from "effect";
import { AiError } from "effect/ai";
import { HttpClient, HttpClientRequest } from "effect/http";

import {
  ApiKey,
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
import { authFailed, signedInOrOut } from "../sign.ts";

const keyVariable = "OPENAI_API_KEY";

export const apiUrl = "https://api.openai.com/v1";

const ModelIds = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) });

/** The saved key, else the environment's. */
const keyOf = (credentials: Credentials["Service"]) =>
  credentials.get("openai").pipe(
    Effect.map(Option.filter(Schema.is(ApiKey))),
    Effect.flatMap((saved) =>
      Option.isSome(saved)
        ? Effect.succeedSome(saved.value.key)
        : Effect.orDie(Config.option(Config.Redacted(keyVariable))),
    ),
  );

/** The key to sign a call with, read on each call so a missing one fails the call. */
const apiKeyOf = (credentials: Credentials["Service"]) =>
  keyOf(credentials).pipe(
    Effect.catchTag("CredentialsFailed", (error) => authFailed("OpenAI", error.message, "Unknown")),
    Effect.flatMap(
      Option.match({
        onNone: () => authFailed("OpenAI", `Run liminal connect, or set ${keyVariable}.`),
        onSome: Effect.succeed,
      }),
    ),
  );

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
  const apiKey = apiKeyOf(credentials);

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
    signedIn: signedInOrOut(Effect.map(keyOf(credentials), Option.isSome)),
    models,
    languageModel,
    // The Decisions API takes only API keys, so `chatgpt` and `codex` offer no classifier.
    classifiers: Effect.succeed([{ id: "openai/gpt-6-luna", name: "GPT-6 Luna" }]),
    decisionModel,
  });
});
