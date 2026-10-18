/**
 * Provider `opencode-go`: one streamed call per request, on the protocol models.dev gives the
 * model: Chat Completions by default, Messages or Responses for the models that name those
 * packages.
 */

import { Effect, FileSystem, Layer, Match, Option, type Redacted, Stream } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import { apiKeyOf, CredentialStore } from "@liminal/credential-store/contract";
import { LoginMethod, LoginMethods } from "@liminal/logins/contract";
import { type CatalogModel, ModelCatalog } from "@liminal/model-catalog/contract";
import { ModelProviders, ModelSource } from "@liminal/models/contract";
import { type CatalogUnavailable, ModelError, type ModelRequest, ThinkingOff } from "@liminal/sdk";
import { chatStream } from "@liminal/sdk/ai/chat";
import { messagesStream } from "@liminal/sdk/ai/messages";
import { responsesStream } from "@liminal/sdk/ai/responses";

import { openCodeGoLogin, openCodeGoProvider, openCodeKeyVariable } from "../contract.ts";
import { withMessagesDefaults } from "./usage.ts";

const catalogId = "opencode-go";

const apiUrl = "https://opencode.ai/inference/go/v1";

/** Effect's Anthropic client adds `/v1/messages` itself. */
const messagesUrl = "https://opencode.ai/inference/go";

const named = { provider: openCodeGoProvider, name: "OpenCode Go" };

type Protocol = "chat" | "messages" | "responses";

/** The protocols of the AI SDK packages models.dev names; a model naming another is left out. */
const packageProtocols: ReadonlyMap<string, Protocol> = new Map([
  ["@ai-sdk/anthropic", "messages"],
  ["@ai-sdk/openai", "responses"],
]);

/** A model with no package of its own uses its provider's protocol, Chat Completions. */
const protocolOf = (model: CatalogModel) =>
  Option.match(model.package, {
    onNone: () => Option.some<Protocol>("chat"),
    onSome: (name) => Option.fromUndefinedOr(packageProtocols.get(name)),
  });

/** Tells OpenCode the client and, when the request has one, the conversation a call belongs to. */
const headersOf = (request: ModelRequest) =>
  request.cacheKey === undefined
    ? { "x-opencode-client": "liminal" }
    : { "x-opencode-client": "liminal", "x-opencode-session": request.cacheKey };

/** What every call needs: the HTTP client, the file system for images, and the key. */
interface Wire {
  readonly http: HttpClient.HttpClient;
  readonly fs: FileSystem.FileSystem;
  readonly key: Effect.Effect<Redacted.Redacted, ModelError>;
}

/** Client options for one call to `address`: the key and OpenCode's headers. */
const optionsOf = (wire: Wire, request: ModelRequest, address: string) =>
  Effect.map(wire.key, (apiKey) => ({
    apiKey,
    apiUrl: address,
    transformClient: HttpClient.mapRequest(HttpClientRequest.setHeaders(headersOf(request))),
  }));

/** Messages options, the replies also filled with the fields Effect's client requires. */
const messagesOptions = (wire: Wire, request: ModelRequest) =>
  Effect.map(optionsOf(wire, request, messagesUrl), (options) => ({
    ...options,
    transformClient: (client: HttpClient.HttpClient) =>
      withMessagesDefaults(options.transformClient(client)),
  }));

const streamOn = (wire: Wire, protocol: Protocol, request: ModelRequest) =>
  Match.value(protocol).pipe(
    Match.when("chat", () =>
      chatStream(wire.http, wire.fs, { ...named, options: optionsOf(wire, request, apiUrl) })(
        request,
      ),
    ),
    Match.when("responses", () =>
      responsesStream(wire.http, wire.fs, { ...named, options: optionsOf(wire, request, apiUrl) })(
        request,
      ),
    ),
    Match.when("messages", () =>
      messagesStream(wire.http, wire.fs, {
        ...named,
        options: messagesOptions(wire, request),
        preamble: [],
      })(request),
    ),
    Match.exhaustive,
  );

const unavailable = (error: CatalogUnavailable) =>
  new ModelError({ reason: "network", message: error.message });

/** The protocol for model `id`; a model the catalog does not list uses Chat Completions. */
const protocolFor = (catalog: ModelCatalog["Service"], id: string) =>
  Effect.flatMap(Effect.mapError(catalog.models(catalogId), unavailable), (models) => {
    const found = models.find((model) => model.info.id === id);
    if (found === undefined) return Effect.succeed<Protocol>("chat");

    return Effect.mapError(
      Effect.fromOption(protocolOf(found)),
      () =>
        new ModelError({
          reason: "invalid-request",
          message: `OpenCode Go model ${id} is on a protocol Liminal does not call`,
        }),
    );
  });

/** The catalog's OpenCode Go models on a protocol Liminal calls. */
const listed = (catalog: ModelCatalog["Service"]) =>
  Effect.map(Effect.mapError(catalog.models(catalogId), unavailable), (models) =>
    models.flatMap((model) => (Option.isSome(protocolOf(model)) ? [model.info] : [])),
  );

/**
 * Registers provider `opencode-go` and its API key login; needs an `HttpClient`, which tests
 * replace.
 */
export const openCodeGoLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const catalog = yield* ModelCatalog;
    const store = yield* CredentialStore;

    const wire: Wire = {
      http: yield* HttpClient.HttpClient,
      fs: yield* FileSystem.FileSystem,
      key: apiKeyOf(store, {
        login: openCodeGoLogin,
        env: openCodeKeyVariable,
        name: "OpenCode Go",
      }),
    };

    yield* (yield* LoginMethods).register(
      LoginMethod.ApiKey({
        id: openCodeGoLogin,
        vendor: { id: "opencode-go", name: "OpenCode Go" },
        title: "API key",
        env: openCodeKeyVariable,
      }),
    );

    yield* (yield* ModelProviders).register({
      id: openCodeGoProvider,
      name: "OpenCode Go",
      source: ModelSource.Listed({ models: listed(catalog) }),
      checkLogin: Effect.asVoid(wire.key),
      stream: (request) =>
        Stream.unwrap(
          Effect.map(protocolFor(catalog, request.model.id), (protocol) =>
            streamOn(wire, protocol, request),
          ),
        ),
      nativeToolChanges: false,
      cheap: { id: "deepseek-v4.1-flash", thinking: ThinkingOff.make({}) },
    });
  }),
);
