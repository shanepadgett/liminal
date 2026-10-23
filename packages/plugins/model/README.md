# @shanepadgett/liminal-model

The model vocabulary and the one path every model call takes. Knows nothing of sessions.

- `Message` and `Part` (`Text`, `Image`, `Reasoning`, `ToolCall`, `ToolResult`, `ToolChange`): what the log stores and the model sees. Images hold their data in base64. A `ToolChange`, in user messages only, holds tools offered or changed and tools removed since the request's tools were declared.
- `ToolDefinition`: a tool's name, description and input JSON Schema, as the model is told.
- `ModelRequest`: model, thinking level, system prompt, tool definitions, messages, tool choice and an optional structured `output`.
- `ModelProviders`: the registry providers add to. A provider gives its models, its default `main` model for turns and `small` model for side calls, whether it is signed in, and an Effect AI `LanguageModel` for each model. A provider whose models take tool changes mid-conversation sets `nativeToolChanges(model)`; `languageModel` then gets `toolChanges`, the declared tools and each change, to send in its own form. For any other model, each change is a `<tool-update>` note in its user message and the request sends the tools after every change.
- `ModelCatalog`: `ModelDetails` by catalog id: limits, thinking levels, capabilities and price. A provider names its `catalogId`; `Models.list` adds each model's details, and `languageModel` gets them. With the catalog unavailable, models list without details and calls still run. `model-catalog` provides it.
- `ModelCall`: the pipeline every call runs through. It streams `ModelDelta`s: Effect AI's reply parts, plus a `retry` delta when a retryable `AiError` is tried again. A reply that fails partway restarts.
- `Reply.add` and `Reply.message`: turn deltas into the assistant `Message`.
- `Models.resolve("small" or id)`, `Models.list` (signed-in providers only; one whose list fails is logged and left out), `Models.generate` and `Models.generateObject`: one-off calls outside the turn loop. A `prefix` request, such as `Turns.request(id)`, shares that session's cache. `system` sets the system prompt.
- `generateObject` with `tools`: each `StepTool` is a definition and a `run` that returns text, run directly and not logged. The schema becomes an `answer` tool, every step must call a tool, and the call ends when an answer decodes; after `maxSteps` model calls, 6 when left out, it fails with `StructuredOutputError`.
- `Models.classify(definition, { model?, input })`: asks a classifier Effect AI `Decision` questions about an input, once, without retries. It uses `model`, else the `classifier` setting, else the first classifier a signed-in provider lists, else fails with `ModelNotFound`. A provider offers classifiers with `classifiers` and an Effect AI `DecisionModel` for each from `decisionModel`.
- `ModelRpc`, for screens: `model/list` gives each signed-in provider's models with their provider's name, context window and thinking levels; `model/details` gives one model's, read from the catalog without asking its provider.
- `CatalogModel.kind`: `chat`, `embedding`, `image` or `realtime`, so a provider can list only chat models.
- `CatalogModel.wire`: `messages`, `responses` or `chat`, the API the model is called through; missing when the catalog names another.

Requires `Settings`, `DeclaredSettings` and `ModelCatalog`.

## Settings

```jsonc
{
  "model": {
    "small": { "model": "anthropic/claude-haiku-5-5" },
    "attempts": 5, // tries per call, the first included
    "classifier": "openai/gpt-6-luna", // unset picks one
  },
}
```

`small` runs side calls; unset, it is the default of the first provider that is signed in. Which model runs a turn is `loop`'s `SessionModel`.

## Add a provider

```ts
yield* (yield* ModelProviders).add({
  id: "acme",
  name: "Acme",
  catalogId: "acme",
  defaults: { main: { model: "acme/large" }, small: { model: "acme/small" } },
  signedIn: Effect.succeed(true),
  models: Effect.succeed([{ id: "acme/large", name: "Acme Large" }]),
  // options: thinking, cacheKey and the model's details
  languageModel: (model, options) => makeAcmeLanguageModel(model, options),
});
```

Wrap `ModelCall` to watch or change every call, such as counting usage.
