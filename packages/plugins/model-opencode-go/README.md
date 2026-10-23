# @shanepadgett/liminal-model-opencode-go

OpenCode Go's models as the `opencode-go` provider in `ModelProviders`.

- Adds an API key login to `LoginMethods`, under OpenCode Go in `liminal connect`.
- Signs each call with the saved key, else the key in `OPENCODE_API_KEY`. A call with neither fails with an `AiError` that says to run `liminal connect`.
- Defaults: `main` and `small` are `opencode-go/deepseek-v4.1-flash`.
- Lists the catalog's `opencode-go` chat models that use a wire Liminal speaks, with their details.
- Calls each model through the wire the catalog names: Anthropic Messages, OpenAI Responses or Chat Completions. A model the catalog does not list goes through Chat Completions.
- Fills in the fields OpenCode Go's Anthropic Messages stream leaves out, such as cache usage, so replies decode.
- Sends `x-opencode-client: liminal`, and the cache key as `x-opencode-session`.
- Thinking: `off`, or an effort level the model takes, such as `low`, `high` or `max`. Unset leaves it to the model.

```jsonc
{
  "model-choice": {
    "default": { "model": "opencode-go/deepseek-v4.1-flash", "thinking": "high" },
  },
}
```

Requires `ModelProviders`, `ModelCatalog`, `Credentials`, `LoginMethods` and `HttpClient`. To change how calls are sent, wrap `ModelCall`.
