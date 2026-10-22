# @shanepadgett/liminal-model

The model vocabulary and the one path every model call takes. Knows nothing of sessions.

- `Message` and `Part` (`Text`, `Image`, `Reasoning`, `ToolCall`, `ToolResult`): what the log stores and the model sees. Images hold their data in base64.
- `ToolDefinition`: a tool's name, description and input JSON Schema, as the model is told.
- `ModelRequest`: model, thinking level, system prompt, tool definitions, messages, tool choice and an optional structured `output`.
- `ModelProviders`: the registry providers add to. A provider gives its models, its defaults for the `main` and `small` roles, whether it is signed in, and an Effect AI `LanguageModel` for each model.
- `ModelCatalog`: `ModelDetails` by catalog id: limits, thinking levels, capabilities and price. A provider names its `catalogId`; `Models.list` adds each model's details, and `languageModel` gets them. With the catalog unavailable, models list without details and calls still run. `model-catalog` provides it.
- `ModelCall`: the pipeline every call runs through. It streams `ModelDelta`s: Effect AI's reply parts, plus a `retry` delta when a retryable `AiError` is tried again. A reply that fails partway restarts.
- `Reply.add` and `Reply.message`: turn deltas into the assistant `Message`.
- `Models.resolve(role or id)`, `Models.list`, `Models.generate` and `Models.generateObject`: one-off calls outside the turn loop. A `prefix` request, such as `Turns.request(id)`, shares that session's cache.

Requires `Settings`, `DeclaredSettings` and `ModelCatalog`.

## Settings

```jsonc
{
  "model": {
    "main": { "model": "anthropic/claude-sonnet-5-5", "thinking": "high" },
    "attempts": 5, // tries per call, the first included
  },
}
```

`main` runs turns and `small` runs side calls. A role left unset uses the default of the first provider that is signed in.

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
