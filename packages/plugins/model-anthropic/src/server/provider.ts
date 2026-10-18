/**
 * Providers `anthropic` and `anthropic-api`: one streamed Messages call per request, signed with a
 * Claude subscription or an API key.
 */

import { Effect, FileSystem, Layer } from "effect";
import { HttpClient } from "effect/http";

import { apiKeyOf, CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { ThinkingOff } from "@liminal/sdk";
import { type MessagesSigning, messagesStream } from "@liminal/sdk/ai/messages";

import { anthropicApiProvider, anthropicKeyVariable, claudeProvider } from "../contract.ts";
import { checkClaudeLogin, claudeCodeIdentity, freshAccess, signAsClaudeCode } from "./auth.ts";
import { claudeMethod } from "./login.ts";
import { type ClaudeCode, makeClaudeCode } from "./version.ts";

/** The saved key, else the one in `ANTHROPIC_API_KEY`. */
const keyOf = (store: CredentialStore["Service"]) =>
  apiKeyOf(store, { login: anthropicApiProvider, env: anthropicKeyVariable, name: "Anthropic" });

const keySigning = (store: CredentialStore["Service"]): MessagesSigning => ({
  provider: anthropicApiProvider,
  name: "Anthropic",
  options: Effect.map(keyOf(store), (apiKey) => ({ apiKey })),
  preamble: [],
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
      stream: messagesStream(http, fs, claudeSigning(store, http, claudeCode)),
      nativeToolChanges: false,
      cheap: { id: "claude-haiku-5-5", thinking: ThinkingOff.make({}) },
    });

    yield* providers.register({
      id: anthropicApiProvider,
      name: "Anthropic",
      source: ModelSource.Catalog({ catalogId: "anthropic" }),
      checkLogin: Effect.asVoid(keyOf(store)),
      stream: messagesStream(http, fs, keySigning(store)),
      nativeToolChanges: false,
      cheap: { id: "claude-haiku-5-5", thinking: ThinkingOff.make({}) },
    });
  }),
);
