# @shanepadgett/liminal-model-openrouter

OpenRouter's models as the `openrouter` provider in `ModelProviders`.

- Adds an API key login to `LoginMethods`, under OpenRouter in `liminal connect`.
- Signs each call with the saved key, else the key in `OPENROUTER_API_KEY`. A call with neither fails with an `AiError` that says to run `liminal connect`.
- Defaults: `main` and `small` are `openrouter/deepseek/deepseek-v4.1-flash-1017`.
- Lists the catalog's `openrouter` chat models, with their details. Model ids keep OpenRouter's slash, such as `openrouter/anthropic/claude-haiku-5-5`.
- Sends the cache key as `session_id`, so OpenRouter routes a session's calls to one upstream provider and its cache.
- Thinking: `off`, or an effort level such as `low`, `medium`, `high` or `max`. Unset leaves it to the model.
- Offers Jev (`openrouter/typesafe/jev-1.13`) as a classifier for `Models.classify`.

```jsonc
{
  "model": {
    "main": { "model": "openrouter/deepseek/deepseek-v4.1-flash-1017", "thinking": "high" },
  },
  "classifier": "openrouter/typesafe/jev-1.13",
}
```

Requires `ModelProviders`, `ModelCatalog`, `Credentials`, `LoginMethods` and `HttpClient`. To change how calls are sent, wrap `ModelCall`.
