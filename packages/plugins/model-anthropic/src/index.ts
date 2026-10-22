/**
 * Anthropic's Claude models, signed with the saved login: a Claude subscription or an API key, else
 * the key in `ANTHROPIC_API_KEY`.
 */
import { Config, Effect, Layer, Option, Schema } from "effect";
import { AiError } from "effect/ai";
import { HttpClient } from "effect/http";

import {
  ApiKey,
  apiKeyMethod,
  Credentials,
  LoginMethods,
} from "@shanepadgett/liminal-accounts/contract";
import { definePlugin } from "@shanepadgett/liminal-core";
import { ModelCatalog } from "@shanepadgett/liminal-model-catalog/contract";
import { messagesModel, messagesModels } from "@shanepadgett/liminal-model-wire/messages";
import { type ModelDetails, ModelProviders } from "@shanepadgett/liminal-model/contract";

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

const keyInEnvironment = Effect.map(
  Effect.orDie(Config.option(Config.Redacted(keyVariable))),
  Option.isSome,
);

/** A saved login or a key in the environment; a failing store counts as signed out. */
const signedIn = (credentials: Credentials["Service"]) =>
  credentials.get("anthropic").pipe(
    Effect.flatMap((saved) => (Option.isSome(saved) ? Effect.succeed(true) : keyInEnvironment)),
    Effect.catchTag("CredentialsFailed", (error) =>
      Effect.as(Effect.logWarning(error.message), false),
    ),
  );

/** The key in the environment, read on each call so a missing one fails the call. */
const fromEnvironment = Effect.gen(function* () {
  const key = yield* Config.option(Config.Redacted(keyVariable)).pipe(Effect.orDie);
  if (Option.isSome(key)) return { apiKey: key.value };

  return yield* authFailed(`Run liminal connect, or set ${keyVariable}.`);
});

/** How to sign each call: the saved login, refreshed when due, else the environment's key. */
const signing = (credentials: Credentials["Service"], http: HttpClient.HttpClient) =>
  Effect.gen(function* () {
    const saved = yield* credentials.get("anthropic");
    if (Option.isNone(saved)) return yield* fromEnvironment;
    if (Schema.is(ApiKey)(saved.value)) return { apiKey: saved.value.key };

    const tokens = yield* credentials.fresh("anthropic", refreshTokens(http));

    return { transformClient: asClaudeCode(tokens.access) };
  }).pipe(
    Effect.catchTags({
      CredentialsFailed: (error) => authFailed(error.message, "Unknown"),
      HttpClientError: refreshFailed,
      SchemaError: refreshFailed,
      TokensRefused: refreshFailed,
    }),
  );

const register = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const withHttp = Effect.provideService(HttpClient.HttpClient, http);
  const catalog = yield* ModelCatalog;
  const credentials = yield* Credentials;
  const options = signing(credentials, http);
  const logins = yield* LoginMethods;

  yield* logins.add(subscriptionMethod(http));
  yield* logins.add(apiKeyMethod("anthropic"));

  /** Details by model id; without the catalog, models go without them and calls still run. */
  const details = catalog.models("anthropic").pipe(
    Effect.map((models) => new Map(models.map((model) => [model.id, model.details]))),
    Effect.catchTag("CatalogUnavailable", (error) =>
      Effect.as(Effect.logWarning(error.message), new Map<string, ModelDetails>()),
    ),
  );

  const models = Effect.gen(function* () {
    const listed = yield* withHttp(Effect.flatMap(options, messagesModels));
    const known = yield* details;

    return listed.map(({ id, name }) => ({ id: `anthropic/${id}`, name, details: known.get(id) }));
  });

  const languageModel = Effect.fn("Anthropic.languageModel")(function* (
    model: string,
    thinking: string | undefined,
  ) {
    const outputLimit = (yield* details).get(model)?.outputLimit;

    return yield* withHttp(messagesModel(yield* options, model, { thinking, outputLimit }));
  });

  yield* (yield* ModelProviders).add({
    id: "anthropic",
    name: "Anthropic",
    defaults: {
      main: { model: "anthropic/claude-sonnet-5-5" },
      small: { model: "anthropic/claude-haiku-5-5" },
    },
    signedIn: signedIn(credentials),
    models,
    languageModel,
  });
});

export default definePlugin({
  name: "model-anthropic",
  provides: [],
  requires: [ModelProviders, ModelCatalog, Credentials, LoginMethods, HttpClient.HttpClient],
  layer: Layer.effectDiscard(register),
});
