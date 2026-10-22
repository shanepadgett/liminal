# @shanepadgett/liminal-model-anthropic

Anthropic's Claude models as the `anthropic` provider in `ModelProviders`.

- Signs with the key in `ANTHROPIC_API_KEY`. A call without one fails with an `AiError` that names the variable.
- Defaults: `main` is `anthropic/claude-opus-5-5`, `small` is `anthropic/claude-haiku-5-5`.
- Lists the models Anthropic's API offers to the key, with details from `ModelCatalog`.
- Sends the catalog's output limit as `max_tokens`. Without the catalog, Effect AI's default for the model applies.
- Thinking: `off`, or an effort level such as `low`, `medium`, `high` or `max`. Unset leaves it to the model.

```jsonc
{
  "model": {
    "main": { "model": "anthropic/claude-opus-5-5", "thinking": "high" },
  },
}
```

Requires `ModelProviders`, `ModelCatalog` and `HttpClient`. To change how calls are sent, wrap `ModelCall`.
