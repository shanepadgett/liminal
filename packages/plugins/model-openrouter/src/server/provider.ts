/** Provider `openrouter`: one streamed Chat Completions call per request through OpenRouter. */

import { Generated, OpenRouterClient, OpenRouterLanguageModel } from "@effect/ai-openrouter";
import {
  Duration,
  Effect,
  FileSystem,
  Layer,
  Match,
  Option,
  Predicate,
  type Redacted,
  Schema,
  Stream,
} from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { apiKeyOf, CredentialStore } from "@liminal/credential-store/contract";
import { DecisionModels } from "@liminal/decisions/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ModelError, type ModelRequest, type ThinkingValue, ThinkingOff } from "@liminal/sdk";
import { type ProviderPrompt, replyOf } from "@liminal/sdk/ai";
import { systemOne } from "@liminal/sdk/ai/decisions";

import { openRouterKeyVariable, openRouterLogin, openRouterProvider } from "../contract.ts";

const apiUrl = "https://openrouter.ai/api/v1";

/**
 * What `@effect/ai-openrouter` puts on reasoning and tool call parts: the upstream model's
 * reasoning details, which some models need back on later turns.
 */
const OpenRouterData = Schema.Struct({
  openrouter: Schema.Struct({
    reasoningDetails: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Json))),
  }),
});

/** OpenRouter passes cache marks on to the models that take them, such as Anthropic's. */
const OpenRouterPrompt: ProviderPrompt = {
  data: OpenRouterData,
  cache: Option.some({ openrouter: { cacheControl: { type: "ephemeral" } } }),
};

const isEffort = Schema.is(Generated.ReasoningEffort);

type Reasoning = Readonly<Record<string, Schema.Json>>;

/** OpenRouter's `reasoning` field for `thinking`: a switch, an effort or a token budget. */
const reasoningOf = (thinking: ThinkingValue): Effect.Effect<Reasoning, ModelError> =>
  Match.valueTags(thinking, {
    Off: () => Effect.succeed({ enabled: false }),
    On: () => Effect.succeed({ enabled: true }),
    Effort: ({ effort }) =>
      isEffort(effort)
        ? Effect.succeed({ effort })
        : Effect.fail(
            new ModelError({
              reason: "invalid-request",
              message: `OpenRouter takes no thinking effort ${effort}`,
            }),
          ),
    Budget: ({ tokens }) => Effect.succeed({ max_tokens: tokens }),
  });

const decodeBody = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
);

/**
 * Sets `reasoning` on each JSON request body. `@effect/ai-openrouter` types the Chat request's
 * `reasoning` with `effort` alone, though OpenRouter also takes `enabled` and `max_tokens`.
 */
const withReasoning =
  (reasoning: Reasoning) =>
  (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest => {
    if (!Predicate.isTagged(request.body, "Uint8Array")) return request;

    return Option.match(decodeBody(new TextDecoder().decode(request.body.body)), {
      onNone: () => request,
      onSome: (body) => HttpClientRequest.bodyJsonUnsafe(request, { ...body, reasoning }),
    });
  };

/** The `effect/ai` language model for `request`, signed with `key`. */
const languageModel = (
  key: Effect.Effect<Redacted.Redacted, ModelError>,
  http: HttpClient.HttpClient,
  request: ModelRequest,
) =>
  Effect.gen(function* () {
    const reasoning = yield* reasoningOf(request.thinking);

    const client = yield* OpenRouterClient.make({
      apiKey: yield* key,
      apiUrl,
      transformClient: HttpClient.mapRequest(withReasoning(reasoning)),
    }).pipe(Effect.provideService(HttpClient.HttpClient, http));

    return yield* OpenRouterLanguageModel.make({
      model: request.model.id,
      config: { ...request.providerOptions?.[openRouterProvider] },
    }).pipe(Effect.provideService(OpenRouterClient.OpenRouterClient, client));
  });

/** Jev on the OpenRouter key, when decisions is loaded; Luna Decisions runs only on an OpenAI key. */
const registerDecisions = Effect.fn("openrouter.registerDecisions")(function* (
  http: HttpClient.HttpClient,
  key: Effect.Effect<Redacted.Redacted, ModelError>,
) {
  const decisionModels = yield* Effect.serviceOption(DecisionModels);

  if (Option.isNone(decisionModels)) return;

  const available = Effect.isSuccess(key);

  yield* decisionModels.value.register({
    id: "openrouter/jev",
    family: "jev",
    available,
    classify: systemOne(http, { url: `${apiUrl}/systemone`, key, model: "~typesafe/jev-latest" }),
  });
});

/**
 * Registers provider `openrouter`, its API key login, and Jev when decisions is loaded; needs an
 * `HttpClient`, which tests replace.
 */
export const openRouterLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* CredentialStore;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;

    const key = apiKeyOf(store, {
      login: openRouterLogin,
      env: openRouterKeyVariable,
      name: "OpenRouter",
    });

    yield* (yield* LoginMethods).register(
      LoginMethod.ApiKey({
        id: openRouterLogin,
        vendor: { id: "openrouter", name: "OpenRouter" },
        title: "API key",
        env: openRouterKeyVariable,
      }),
    );

    yield* (yield* ModelProviders).register({
      id: openRouterProvider,
      name: "OpenRouter",
      source: ModelSource.Catalog({ catalogId: "openrouter" }),
      checkLogin: Effect.asVoid(key),
      stream: (request) =>
        replyOf("OpenRouter", OpenRouterPrompt, languageModel(key, http, request), request).pipe(
          Stream.provideService(FileSystem.FileSystem, fs),
        ),
      nativeToolChanges: false,
      cheap: { id: "~deepseek/deepseek-flash-latest", thinking: ThinkingOff.make({}) },
      cacheLifetime: Duration.minutes(5),
    });

    yield* registerDecisions(http, key);
  }),
);
