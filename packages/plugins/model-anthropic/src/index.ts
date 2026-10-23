/**
 * Anthropic's Claude models, signed with the saved login: a Claude subscription or an API key, else
 * the key in `ANTHROPIC_API_KEY`.
 */
import { Effect, Layer, Option, Schema } from "effect";
import { AiError } from "effect/ai";
import { HttpClient } from "effect/http";

import {
  type ApiKeyLogin,
  apiKeyLogin,
  apiKeyMethod,
  Credentials,
  LoginMethods,
  OAuth,
} from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import { messagesModel, messagesModels } from "@shanepadgett/liminal-model-wire/messages";
import { type LanguageModelOptions, ModelProviders } from "@shanepadgett/liminal-model/contract";

import { asClaudeCode, refreshTokens, subscriptionMethod } from "./subscription.ts";

const keyVariable = "ANTHROPIC_API_KEY";

const authFailed = (
  description: string,
  kind: AiError.AuthenticationError["kind"] = "MissingKey",
) =>
  AiError.make({
    module: "Anthropic",
    method: "sign",
    reason: new AiError.AuthenticationError({ kind, description }),
  });

const refreshFailed = (error: { readonly message: string }) =>
  authFailed(
    `Refreshing the Claude login failed: ${error.message}. Run liminal connect.`,
    "ExpiredKey",
  );

/**
 * How to sign each call: a saved Claude subscription, refreshed when due, else the API key login's
 * key.
 */
const signing = (
  credentials: Credentials["Service"],
  login: ApiKeyLogin,
  http: HttpClient.HttpClient,
) =>
  Effect.gen(function* () {
    const saved = yield* credentials.get("anthropic");

    if (Option.isSome(saved) && Schema.is(OAuth)(saved.value)) {
      const tokens = yield* credentials.fresh("anthropic", refreshTokens(http));

      return { transformClient: asClaudeCode(tokens.access) };
    }

    return { apiKey: yield* login.key };
  }).pipe(
    Effect.catchTags({
      CredentialsFailed: (error) => authFailed(error.message),
      TokensRefused: refreshFailed,
    }),
  );

/** The models that take `tool_addition` and `tool_removal` blocks, from Pi's model lists. */
const nativeModels = [
  /^claude-opus-(?:4[.-]8|5(?:[.-]5)?)(?:-\d{8})?$/,
  /^claude-(?:sonnet|haiku)-5[.-]5(?:-\d{8})?$/,
  /^claude-(?:fable|mythos)-5(?:[.-]1)?(?:-\d{8})?$/,
];

const nativeToolChanges = (model: string) => nativeModels.some((pattern) => pattern.test(model));

const register = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const credentials = yield* Credentials;
  const login = apiKeyLogin(credentials, "anthropic", keyVariable);
  const options = signing(credentials, login, http);
  const logins = yield* LoginMethods;

  yield* logins.add(subscriptionMethod(http));
  yield* logins.add(apiKeyMethod("anthropic", "Anthropic"));

  const models = Effect.map(withHttp(Effect.flatMap(options, messagesModels)), (listed) =>
    listed.map(({ id, name }) => ({ id: `anthropic/${id}`, name })),
  );

  const languageModel = Effect.fn("Anthropic.languageModel")(function* (
    model: string,
    // Anthropic caches by prefix and ignores the cache key.
    { thinking, details, toolChanges }: LanguageModelOptions,
  ) {
    const outputLimit = details?.outputLimit;

    return yield* withHttp(
      messagesModel(yield* options, model, { thinking, outputLimit, toolChanges }),
    );
  });

  yield* (yield* ModelProviders).add({
    id: "anthropic",
    name: "Anthropic",
    catalogId: "anthropic",
    defaults: {
      main: { model: "anthropic/claude-sonnet-5-5" },
      small: { model: "anthropic/claude-haiku-5-5" },
    },
    signedIn: login.signedIn,
    models,
    nativeToolChanges,
    languageModel,
  });
});

export default definePlugin({
  name: "model-anthropic",
  provides: [],
  requires: [ModelProviders, Credentials, LoginMethods, HttpClient.HttpClient],
  layer: Layer.effectDiscard(register),
});
