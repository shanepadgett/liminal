/**
 * OpenRouter's models through its Chat Completions API, signed with the saved API key, else the key
 * in `OPENROUTER_API_KEY`. It offers Jev as a classifier.
 */
import {
  Generated,
  OpenRouterClient,
  OpenRouterDecisionModel,
  OpenRouterLanguageModel,
} from "@effect/ai-openrouter";
import { Effect, Layer, Schema } from "effect";
import { AiError } from "effect/ai";
import { HttpClient } from "effect/http";

import {
  apiKeyLogin,
  apiKeyMethod,
  Credentials,
  LoginMethods,
} from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import {
  type LanguageModelOptions,
  ModelCatalog,
  ModelProviders,
} from "@shanepadgett/liminal-model/contract";

const keyVariable = "OPENROUTER_API_KEY";

const failed = (method: string, reason: AiError.AiErrorReason) =>
  AiError.make({ module: "OpenRouter", method, reason });

const isEffort = Schema.is(Generated.ReasoningEffort);

/** `off` is the API's `none`; any other level is an effort the API takes. */
const reasoningOf = Effect.fn("OpenRouter.reasoningOf")(function* (thinking: string) {
  const effort = thinking === "off" ? "none" : thinking;
  if (isEffort(effort)) return { effort };

  return yield* failed(
    "languageModel",
    new AiError.InvalidRequestError({
      parameter: "thinking",
      description: `Unknown thinking level ${thinking}. Use off, minimal, low, medium, high, xhigh or max.`,
    }),
  );
});

/**
 * The config for one request: its thinking level, the session OpenRouter routes it by, and for
 * Claude a top-level cache mark, since Claude caches only when asked and other models cache on
 * their own.
 */
const configOf = Effect.fn("OpenRouter.configOf")(function* (
  model: string,
  { thinking, cacheKey }: LanguageModelOptions,
) {
  // Our tool schemas are not written for strict mode, which refuses some JSON Schema keywords.
  const strict = { strictJsonSchema: false };

  const cached = model.startsWith("anthropic/")
    ? { ...strict, cache_control: { type: "ephemeral" as const } }
    : strict;

  const base = cacheKey === undefined ? cached : { ...cached, session_id: cacheKey };

  return thinking === undefined ? base : { ...base, reasoning: yield* reasoningOf(thinking) };
});

const register = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const catalog = yield* ModelCatalog;
  const login = apiKeyLogin(yield* Credentials, "openrouter", keyVariable);

  yield* (yield* LoginMethods).add(apiKeyMethod("openrouter", "OpenRouter"));

  /** A client signed with the key, read on each call so a missing one fails the call. */
  const client = Effect.gen(function* () {
    const apiKey = yield* login.key.pipe(
      Effect.mapError((error) =>
        failed(
          "sign",
          new AiError.AuthenticationError({ kind: "MissingKey", description: error.message }),
        ),
      ),
    );

    return yield* OpenRouterClient.make({ apiKey, siteTitle: "Liminal" }).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );
  });

  const models = catalog.models("openrouter").pipe(
    Effect.map((entries) =>
      entries.flatMap(({ id, name, kind }) =>
        kind === "chat" ? [{ id: `openrouter/${id}`, name }] : [],
      ),
    ),
    Effect.mapError((error) =>
      failed("models", new AiError.UnknownError({ description: error.message })),
    ),
  );

  const languageModel = Effect.fn("OpenRouter.languageModel")(function* (
    model: string,
    options: LanguageModelOptions,
  ) {
    const config = yield* configOf(model, options);

    return yield* OpenRouterLanguageModel.make({ model, config }).pipe(
      Effect.provideService(OpenRouterClient.OpenRouterClient, yield* client),
    );
  });

  const decisionModel = Effect.fn("OpenRouter.decisionModel")(function* (model: string) {
    return yield* OpenRouterDecisionModel.make({ model }).pipe(
      Effect.provideService(OpenRouterClient.OpenRouterClient, yield* client),
    );
  });

  yield* (yield* ModelProviders).add({
    id: "openrouter",
    name: "OpenRouter",
    catalogId: "openrouter",
    defaults: {
      main: { model: "openrouter/deepseek/deepseek-v4.1-flash-1017" },
      small: { model: "openrouter/deepseek/deepseek-v4.1-flash-1017", thinking: "high" },
    },
    signedIn: login.signedIn,
    models,
    languageModel,
    classifiers: Effect.succeed([{ id: "openrouter/typesafe/jev-1.13", name: "Jev 1.13" }]),
    decisionModel,
  });
});

export default definePlugin({
  name: "model-openrouter",
  provides: [],
  requires: [ModelProviders, ModelCatalog, Credentials, LoginMethods, HttpClient.HttpClient],
  layer: Layer.effectDiscard(register),
});
