# Model providers

A model provider plugin lets Liminal call one vendor's models. It registers a provider in `ModelProviders` that turns a `ModelRequest` into a stream of `ModelEvent`s, says where its model list comes from, and registers a login for its key. Write one to add a vendor, a gateway, or a local server. Plugin basics are in [plugins.md](plugins.md).

## Create a provider plugin

1. Create the plugin as in [plugins.md](plugins.md#create-a-plugin), with no TUI part.
2. Require what it reads.

   ```ts
   export default definePlugin({
     name: "model-openrouter",
     provides: [],
     requires: [ModelProviders, CredentialStore, LoginMethods],
     uses: [],
     enabledByDefault: true,
     server: () => import("./src/server.ts"),
   });
   ```

3. Put the provider id, the login id and the key's environment variable in `src/contract.ts`, so tests and other plugins name them the same way.

   ```ts
   export const openRouterProvider = "openrouter";
   export const openRouterLogin = "openrouter";
   export const openRouterKeyVariable = "OPENROUTER_API_KEY";
   ```

4. Write the provider layer in `src/server/provider.ts`, reading `HttpClient.HttpClient`. Give it the real client in `src/server.ts`:

   ```ts
   export const layer = openRouterLayer.pipe(Layer.provide(FetchHttpClient.layer));
   ```

   Tests provide a stub client to the same provider layer instead; see [testing.md](testing.md#test-a-provider).

Examples: `packages/plugins/model-openrouter/`, `packages/plugins/model-opencode-go/`.

## Register the provider

Register a `ModelProvider` from `@liminal/models/contract` in your layer.

```ts
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
});
```

| Field | Meaning |
| --- | --- |
| `id` | The `provider` half of every `ModelRef` (`{ provider, id }`) |
| `name` | Shown in `/model`, `/connect` and errors |
| `source` | Where the model list comes from; see the next section |
| `checkLogin` | Optional; fails with an `auth` `ModelError` while there is no usable login. Listing models checks it first |
| `stream` | One attempt for one request; interrupting the stream cancels the call |
| `nativeToolChanges` | `true` when the provider turns `tool-change` parts into native items; `false` sends every declared tool on each request |
| `cheap` | A small, fast model and its thinking value; other plugins read it through `Models.cheap` and use it for side calls such as reviews |

A provider built on `replyOf` sends `request.toolChoice` (`auto`, `required` or `{ tool }`) for free. A provider with its own stream must map it.

## Choose where models come from

| Source | Use when |
| --- | --- |
| `ModelSource.Catalog({ catalogId })` | models.dev lists the vendor; the catalog plugin fetches and caches it |
| `ModelSource.PlanCatalog({ catalogId, plan })` | The account's plan decides which catalog models show; `plan` is read on each listing |
| `ModelSource.Listed({ models })` | You list the models yourself, such as a local server or a test provider |

- To read catalog details yourself, such as which protocol a model uses, require `ModelCatalog` from `@liminal/model-catalog/contract` and call `models(catalogId)`. Each `CatalogModel` has `info` (a `ModelInfo`) and `package`, the AI SDK package models.dev names for it.

Example: `protocolOf` in `packages/plugins/model-opencode-go/src/server/provider.ts`.

## Stream a reply

Pick the stream helper for the vendor's wire protocol. Each helper converts the request, signs it, streams the reply as `ModelEvent`s, and maps failures to `ModelError`.

| Protocol | Helper | Signing |
| --- | --- | --- |
| OpenAI Chat Completions | `chatStream` from `@liminal/sdk/ai/chat` | `{ provider, name, options }` |
| Anthropic Messages | `messagesStream` from `@liminal/sdk/ai/messages` | `{ provider, name, options, preamble }` |
| OpenAI Responses | `responsesStream` from `@liminal/sdk/ai/responses` | `{ provider, name, options }` |

`options` is an Effect that gives the client options for one call: `apiKey`, `apiUrl`, and `transformClient` to change each HTTP request, such as adding headers.

```ts
chatStream(http, fs, {
  provider: openCodeGoProvider,
  name: "OpenCode Go",
  options: Effect.map(key, (apiKey) => ({
    apiKey,
    apiUrl,
    transformClient: HttpClient.mapRequest(HttpClientRequest.setHeaders(headersOf(request))),
  })),
})(request);
```

Rules:

- When the vendor has its own `@effect/ai-*` package, build its `LanguageModel` and pass it to `replyOf(name, prompt, languageModel, request)` from `@liminal/sdk/ai`. `prompt` is a `ProviderPrompt`: the schema of the vendor's part metadata, and the cache mark to put on marked messages.
- Read the request's own fields only: `model.id`, `messages`, `tools`, `thinking`, `maxOutputTokens`, `cacheKey`, and `providerOptions[<your id>]`.
- Map `thinking` (`Off`, `On`, `Effort`, `Budget`) to the vendor's field. Fail with `invalid-request` for a value the vendor does not take.
- Never retry inside `stream`. Retries belong to `AfterFailureHooks`.
- A new dependency, such as another `@effect/ai-*` package, needs approval and an entry in `docs/reference/sources.json`.

Examples: `packages/plugins/model-opencode-go/src/server/provider.ts` (all three helpers), `packages/plugins/model-openrouter/src/server/provider.ts` (`replyOf` with `@effect/ai-openrouter`).

## Report errors

Fail the stream with `ModelError` from `@liminal/sdk`: `reason`, `message`, and when known `status`, `retryAfter` and `requestId`. The stream helpers and `replyOf` map HTTP failures to it for you; build one yourself only for failures you detect.

| `reason` | When |
| --- | --- |
| `rate-limit` | Too many requests; set `retryAfter` from the response |
| `quota` | The account is out of credit or usage |
| `auth` | No key, or the key was refused |
| `context-overflow` | The request is longer than the model's window |
| `invalid-request` | The request is wrong, such as an unknown model or thinking value |
| `provider` | The vendor failed |
| `network` | The call did not reach the vendor, or the catalog is unavailable |
| `empty-response` | The reply ended with no content |

- A turn that stops on an error saves a notice in the transcript with the message. Write the message for the user: what failed and what to do, such as `No OpenRouter API key: sign in with /connect or set OPENROUTER_API_KEY`.

## Sign in with an API key

1. Register the login in your layer, so `/connect` offers it.

   ```ts
   yield* (yield* LoginMethods).register(
     LoginMethod.ApiKey({
       id: openRouterLogin,
       vendor: { id: "openrouter", name: "OpenRouter" },
       title: "API key",
       env: openRouterKeyVariable,
     }),
   );
   ```

2. Read the key with `apiKeyOf(store, { login, env, name })` from `@liminal/credential-store/contract`. It gives the saved key, else the environment variable, else fails with an `auth` `ModelError` naming both.
3. Read the key inside each call, not once at startup, so a new key applies to the next request.

- Never log or print a key. Keys are `Redacted` values; pass them on as they are.

Example: `openRouterLayer` in `packages/plugins/model-openrouter/src/server/provider.ts`.

## Sign in with a flow

Use `LoginMethod.Flow` for OAuth and device-code sign-in.

| Field | Meaning |
| --- | --- |
| `id` | The credential-store method the credential is saved under |
| `vendor`, `title` | Shown in `/connect` |
| `ways` | The ways to sign in, such as browser and device code, each `{ id, title }` |
| `logIn(way)` | Runs the flow with `LoginFlow` (`openUrl`, `showCode`, `ask`, `askSecret`, `waiting`, `tell`, `authorizeInBrowser`) and returns the `Credential`; `logins` saves it |
| `logOut` | Optional; revokes the credential at the vendor |

- Read an OAuth credential with `CredentialStore.fresh(method, refresh, skew)`. It refreshes the token when it expires within `skew` and holds the store's lock, so only one process refreshes.

Examples: `packages/plugins/model-anthropic/src/server/login.ts` and `auth.ts`, `packages/plugins/model-openai/src/server/chatgpt/`.

## Register a decision model

A decision model answers choice, score and yes or no questions about a JSON state with probabilities. Add `DecisionModels` to the manifest's `uses`, and register only when it is present:

```ts
const decisionModels = yield* Effect.serviceOption(DecisionModels);

if (Option.isSome(decisionModels))
  yield* decisionModels.value.register({
    id: "openai/luna",
    family: "luna",
    available: Effect.isSuccess(key),
    classify: openAiDecisions(http, { url: "https://api.openai.com/v1/decisions", key, model: "gpt-6-luna" }),
  });
```

| Field | Meaning |
| --- | --- |
| `id` | Provider and family, such as `openrouter/jev` |
| `family` | `jev` or `luna`; `decisions` tries Jev first |
| `available` | Whether the login has a usable key |
| `classify` | One call; `systemOne` and `openAiDecisions` from `@liminal/sdk/ai/decisions` build it from a URL, the key and a model id |

Examples: `packages/plugins/model-openrouter/src/server/provider.ts`, `packages/plugins/model-openai/src/server/provider.ts`.

## See also

- [plugins.md](plugins.md): plugin layout and manifests.
- [testing.md](testing.md#test-a-provider): provider tests over a stub HTTP client.
