/**
 * OpenCode Go's models, signed with the saved API key, else the key in `OPENCODE_API_KEY`. Each
 * model is called through the API the catalog names for it.
 */
import { Effect, Layer, type Redacted } from "effect";
import { AiError, type LanguageModel } from "effect/ai";
import { HttpClient, HttpClientRequest } from "effect/http";

import {
  apiKeyLogin,
  apiKeyMethod,
  Credentials,
  LoginMethods,
} from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import { chatModel } from "@shanepadgett/liminal-model-wire/chat";
import { messagesModel } from "@shanepadgett/liminal-model-wire/messages";
import { responsesModel } from "@shanepadgett/liminal-model-wire/responses";
import {
  type LanguageModelOptions,
  ModelCatalog,
  ModelProviders,
  type Wire,
} from "@shanepadgett/liminal-model/contract";

import { withMessagesDefaults } from "./messages-defaults.ts";

const keyVariable = "OPENCODE_API_KEY";

const baseUrl = "https://opencode.ai/inference/go";

/** How to reach and sign one call. */
interface Signing {
  readonly apiKey: Redacted.Redacted;
  readonly transformClient: (client: HttpClient.HttpClient) => HttpClient.HttpClient;
}

type WireModel = (
  signing: Signing,
  model: string,
  options: LanguageModelOptions,
) => Effect.Effect<LanguageModel.LanguageModel, AiError.AiError, HttpClient.HttpClient>;

/** One language model on each wire; Effect's Anthropic client adds `/v1/messages` itself. */
const onWire: Readonly<Record<Wire, WireModel>> = {
  messages: ({ apiKey, transformClient }, model, { thinking, details }) =>
    messagesModel(
      {
        apiKey,
        apiUrl: `${baseUrl}/anthropic`,
        transformClient: (client) => withMessagesDefaults(transformClient(client)),
      },
      model,
      { thinking, outputLimit: details?.outputLimit },
    ),
  responses: (signing: Signing, model: string, { thinking, cacheKey }: LanguageModelOptions) =>
    responsesModel({ ...signing, apiUrl: `${baseUrl}/openai/v1` }, model, { thinking, cacheKey }),
  chat: (signing: Signing, model: string, { thinking }: LanguageModelOptions) =>
    chatModel({ ...signing, apiUrl: `${baseUrl}/openai/v1` }, model, { thinking }),
};

/** OpenCode's client header, and the session it groups calls by. */
const headersOf = (cacheKey: string | undefined) =>
  cacheKey === undefined
    ? { "x-opencode-client": "liminal" }
    : { "x-opencode-client": "liminal", "x-opencode-session": cacheKey };

const failed = (method: string, reason: AiError.AiErrorReason) =>
  AiError.make({ module: "OpenCode Go", method, reason });

const register = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const catalog = yield* ModelCatalog;
  const login = apiKeyLogin(yield* Credentials, "opencode-go", keyVariable);

  yield* (yield* LoginMethods).add(apiKeyMethod("opencode-go", "OpenCode Go"));

  /** The catalog's chat models on a wire Liminal speaks. */
  const entries = Effect.map(catalog.models("opencode-go"), (all) =>
    all.filter((entry) => entry.kind === "chat" && entry.wire !== undefined),
  );

  /** The model's wire; one the catalog does not list, or an unreadable catalog, is Chat. */
  const wireOf = (model: string) =>
    entries.pipe(
      Effect.map((listed) => listed.find((entry) => entry.id === model)?.wire ?? "chat"),
      Effect.catchTag("CatalogUnavailable", (error) =>
        Effect.as(Effect.logWarning(error.message), "chat" as const),
      ),
    );

  const models = entries.pipe(
    Effect.map((listed) => listed.map(({ id, name }) => ({ id: `opencode-go/${id}`, name }))),
    Effect.mapError((error) =>
      failed("models", new AiError.UnknownError({ description: error.message })),
    ),
  );

  const languageModel = Effect.fn("OpenCodeGo.languageModel")(function* (
    model: string,
    options: LanguageModelOptions,
  ) {
    const apiKey = yield* login.key.pipe(
      Effect.mapError((error) =>
        failed(
          "sign",
          new AiError.AuthenticationError({ kind: "MissingKey", description: error.message }),
        ),
      ),
    );

    const signing: Signing = {
      apiKey,
      transformClient: HttpClient.mapRequest(
        HttpClientRequest.setHeaders(headersOf(options.cacheKey)),
      ),
    };

    const wire = yield* wireOf(model);

    return yield* onWire[wire](signing, model, options).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );
  });

  yield* (yield* ModelProviders).add({
    id: "opencode-go",
    name: "OpenCode Go",
    catalogId: "opencode-go",
    defaults: {
      main: { model: "opencode-go/deepseek-v4.1-flash" },
      small: { model: "opencode-go/deepseek-v4.1-flash" },
    },
    signedIn: login.signedIn,
    models,
    languageModel,
  });
});

export default definePlugin({
  name: "model-opencode-go",
  provides: [],
  requires: [ModelProviders, ModelCatalog, Credentials, LoginMethods, HttpClient.HttpClient],
  layer: Layer.effectDiscard(register),
});
