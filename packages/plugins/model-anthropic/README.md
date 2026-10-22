# @shanepadgett/liminal-model-anthropic

Anthropic's Claude models as the `anthropic` provider in `ModelProviders`.

- Adds two logins to `LoginMethods`, under Anthropic in `liminal connect`: an API key, and the Claude subscription (Pro or Max) through the browser.
- Signs each call with the saved login, else the key in `ANTHROPIC_API_KEY`. A call with neither fails with an `AiError` that says to run `liminal connect`.
- Subscription calls are sent as Claude Code: its OAuth token, headers and identity line, added to the request on the way out. Tokens refresh when they near expiry.
- Defaults: `main` is `anthropic/claude-sonnet-5-5`, `small` is `anthropic/claude-haiku-5-5`.
- Lists the models Anthropic's API offers to the key. Their details come from the `anthropic` entries in the model catalog.
- Sends the catalog's output limit as `max_tokens`. Without the catalog, Effect AI's default for the model applies.
- Thinking: `off`, or an effort level such as `low`, `medium`, `high` or `max`. Unset leaves it to the model.

```jsonc
{
  "model": {
    "main": { "model": "anthropic/claude-opus-5-5", "thinking": "high" },
  },
}
```

Requires `ModelProviders`, `Credentials`, `LoginMethods` and `HttpClient`. To change how calls are sent, wrap `ModelCall`.
