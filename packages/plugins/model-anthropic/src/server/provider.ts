/**
 * Providers `anthropic` and `anthropic-api`: one streamed Messages call per request, signed with a
 * Claude subscription or an API key.
 */

import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Effect, FileSystem, Layer, Option, Schema, Stream } from "effect";
import { HttpClient } from "effect/http";

import { CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ModelError, type ModelRequest } from "@liminal/sdk";
import { type ProviderPrompt, replyOf } from "@liminal/sdk/ai";

import { anthropicApiProvider, anthropicKeyVariable, claudeProvider } from "../contract.ts";
import { checkClaudeLogin, claudeCodeIdentity, freshAccess, signAsClaudeCode } from "./auth.ts";
import { claudeMethod } from "./login.ts";
import { thinkingOf } from "./thinking.ts";
import { type ClaudeCode, makeClaudeCode } from "./version.ts";

/** What `@effect/ai-anthropic` puts on reasoning parts: the signature, or the redacted thinking. */
const AnthropicData = Schema.Struct({
  anthropic: Schema.Struct({
    info: Schema.Union([
      Schema.Struct({ type: Schema.Literal("thinking"), signature: Schema.String }),
      Schema.Struct({ type: Schema.Literal("redacted_thinking"), redactedData: Schema.String }),
    ]),
  }),
});

/** Anthropic caches the prefix up to each marked block for five minutes. */
const AnthropicPrompt: ProviderPrompt = {
  data: AnthropicData,
  cache: Option.some({ anthropic: { cacheControl: { type: "ephemeral" } } }),
};

/** How a provider signs: its client options, and the messages it sends before the request's. */
interface Signing {
  readonly options: Effect.Effect<AnthropicClient.Options, ModelError>;
  readonly preamble: ModelRequest["messages"];
}

const authError = (message: string) => new ModelError({ reason: "auth", message });

/** The saved key, else the one in `ANTHROPIC_API_KEY`. */
const keyOf = (store: CredentialStore["Service"]) =>
  store.secret(anthropicApiProvider, { env: anthropicKeyVariable }).pipe(
    Effect.mapError((error) => authError(`Anthropic key could not be read: ${error.message}`)),
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            authError(`No Anthropic API key: sign in with /connect or set ${anthropicKeyVariable}`),
          ),
        onSome: Effect.succeed,
      }),
    ),
  );

const keySigning = (store: CredentialStore["Service"]): Signing => ({
  options: Effect.map(keyOf(store), (apiKey) => ({ apiKey })),
  preamble: [],
});

/** Signs as Claude Code, which Anthropic also requires to be named first in the system prompt. */
const claudeSigning = (
  store: CredentialStore["Service"],
  http: HttpClient.HttpClient,
  claudeCode: ClaudeCode,
): Signing => ({
  options: Effect.gen(function* () {
    const access = yield* freshAccess(store, http);
    const version = yield* claudeCode.version;

    return { transformClient: HttpClient.mapRequest(signAsClaudeCode(access, version)) };
  }),
  preamble: [claudeCodeIdentity],
});

/** The `effect/ai` language model for `request` from provider `id`, signed as `signing` gives. */
const languageModel = (
  id: string,
  signing: Signing,
  http: HttpClient.HttpClient,
  request: ModelRequest,
) =>
  Effect.gen(function* () {
    const client = yield* AnthropicClient.make(yield* signing.options).pipe(
      Effect.provideService(HttpClient.HttpClient, http),
    );

    return yield* AnthropicLanguageModel.make({
      model: request.model.id,
      config: {
        ...request.providerOptions?.[id],
        ...thinkingOf(request.thinking, request.maxOutputTokens),
        strictJsonSchema: false,
      },
    }).pipe(Effect.provideService(AnthropicClient.AnthropicClient, client));
  });

/** Streams `request` from `provider`, signed as `signing` gives. */
const streamAs =
  (
    provider: { readonly id: string; readonly name: string },
    signing: Signing,
    http: HttpClient.HttpClient,
    fs: FileSystem.FileSystem,
  ) =>
  (request: ModelRequest) =>
    replyOf(provider.name, AnthropicPrompt, languageModel(provider.id, signing, http, request), {
      ...request,
      messages: [...signing.preamble, ...request.messages],
    }).pipe(Stream.provideService(FileSystem.FileSystem, fs));

/**
 * Registers providers `anthropic` and `anthropic-api` and their logins; needs an `HttpClient`,
 * which tests replace.
 */
export const anthropicLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const providers = yield* ModelProviders;
    const logins = yield* LoginMethods;
    const store = yield* CredentialStore;
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const claudeCode = yield* makeClaudeCode(http);

    yield* logins.register(claudeMethod(http));

    yield* logins.register(
      LoginMethod.ApiKey({
        id: anthropicApiProvider,
        vendor: { id: "anthropic", name: "Anthropic" },
        title: "API key",
        env: anthropicKeyVariable,
      }),
    );

    const claude = { id: claudeProvider, name: "Claude" };

    yield* providers.register({
      ...claude,
      source: ModelSource.Catalog({ catalogId: "anthropic" }),
      checkLogin: checkClaudeLogin(store),
      stream: streamAs(claude, claudeSigning(store, http, claudeCode), http, fs),
      nativeToolChanges: false,
    });

    const api = { id: anthropicApiProvider, name: "Anthropic" };

    yield* providers.register({
      ...api,
      source: ModelSource.Catalog({ catalogId: "anthropic" }),
      checkLogin: Effect.asVoid(keyOf(store)),
      stream: streamAs(api, keySigning(store), http, fs),
      nativeToolChanges: false,
    });
  }),
);
