/**
 * Providers `anthropic` and `anthropic-api`: one streamed Messages call per request, signed with a
 * Claude subscription or an API key.
 */

import { Duration, Effect, FileSystem, Layer } from "effect";
import { HttpClient } from "effect/http";

import { apiKeyOf, CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ThinkingOff } from "@liminal/sdk";
import { type MessagesSigning, messagesSearch, messagesStream } from "@liminal/sdk/ai/messages";
import { offerSearchers, providerSearcher } from "@liminal/tools-web/contract";

import { anthropicApiProvider, anthropicKeyVariable, claudeProvider } from "../contract.ts";
import { checkClaudeLogin, claudeCodeIdentity, freshAccess, signAsClaudeCode } from "./auth.ts";
import { claudeMethod } from "./login.ts";
import { type ClaudeCode, makeClaudeCode } from "./version.ts";

/** The small model for side calls and web searches. */
const cheapModel = "claude-haiku-5-5";

/** The saved key, else the one in `ANTHROPIC_API_KEY`. */
const keyOf = (store: CredentialStore["Service"]) =>
  apiKeyOf(store, { login: anthropicApiProvider, env: anthropicKeyVariable, name: "Anthropic" });

/** Claude 3, Opus 4.1, Opus 4 and Sonnet 4: models older than these 4.5 ones and their successors. */
const olderThanDeferredTools =
  /^claude-(?:[0-3](?:\D|$)|instant|(?:opus|sonnet)-4(?:-[01])?(?:-\d{8})?$)/;

/** Claude Haiku 4.5, Sonnet 4.5, Opus 4.5 and every later model load deferred tools themselves. */
const loadsDeferredTools = (id: string) => !olderThanDeferredTools.test(id);

const keySigning = (store: CredentialStore["Service"]): MessagesSigning => ({
  provider: anthropicApiProvider,
  name: "Anthropic",
  options: Effect.map(keyOf(store), (apiKey) => ({ apiKey })),
  preamble: [],
  deferredLoading: loadsDeferredTools,
});

/** Signs as Claude Code, which Anthropic also requires to be named first in the system prompt. */
const claudeSigning = (
  store: CredentialStore["Service"],
  http: HttpClient.HttpClient,
  claudeCode: ClaudeCode,
): MessagesSigning => ({
  provider: claudeProvider,
  name: "Claude",
  options: Effect.gen(function* () {
    const access = yield* freshAccess(store, http);
    const version = yield* claudeCode.version;

    return { transformClient: HttpClient.mapRequest(signAsClaudeCode(access, version)) };
  }),
  preamble: [claudeCodeIdentity],
  deferredLoading: loadsDeferredTools,
});

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
    const claude = claudeSigning(store, http, claudeCode);
    const key = keySigning(store);

    yield* logins.register(claudeMethod(http));

    yield* logins.register(
      LoginMethod.ApiKey({
        id: anthropicApiProvider,
        vendor: { id: "anthropic", name: "Anthropic" },
        title: "API key",
        env: anthropicKeyVariable,
      }),
    );

    yield* providers.register({
      id: claudeProvider,
      name: "Claude",
      source: ModelSource.Catalog({ catalogId: "anthropic" }),
      checkLogin: checkClaudeLogin(store),
      stream: messagesStream(http, fs, claude),
      nativeToolChanges: false,
      cheap: { id: cheapModel, thinking: ThinkingOff.make({}) },
      cacheLifetime: Duration.minutes(5),
    });

    yield* providers.register({
      id: anthropicApiProvider,
      name: "Anthropic",
      source: ModelSource.Catalog({ catalogId: "anthropic" }),
      checkLogin: Effect.asVoid(keyOf(store)),
      stream: messagesStream(http, fs, key),
      nativeToolChanges: false,
      cheap: { id: cheapModel, thinking: ThinkingOff.make({}) },
      cacheLifetime: Duration.minutes(5),
    });

    yield* offerSearchers([
      providerSearcher("Claude", messagesSearch(http, fs, claude, cheapModel)),
      providerSearcher("Anthropic", messagesSearch(http, fs, key, cheapModel)),
    ]);
  }),
);
