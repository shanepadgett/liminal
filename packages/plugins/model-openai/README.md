# @shanepadgett/liminal-model-openai

OpenAI's models in `ModelProviders`, one provider for each way of signing in. Calls go where the login points.

## `codex`

OpenAI's models on a ChatGPT plan (Plus, Pro, Business). Calls go to the Codex backend, signed as the Codex CLI signs them.

- Adds the Codex login to `LoginMethods`, under OpenAI in `liminal connect`: through the browser, or with a code entered on another device. Tokens refresh when they near expiry.
- A call without a saved login fails with an `AiError` that says to run `liminal connect`.
- Defaults: `main` is `codex/gpt-6.1-sol`, `small` is `codex/gpt-6-luna`.
- Lists the models the plan offers. Their details come from the `openai` entries in the model catalog.
- Nothing is stored on the backend. Each call carries the whole conversation, and the session id goes along as the cache key.
- Thinking: `off`, or an effort level such as `low`, `medium`, `high` or `xhigh`. Unset leaves it to the model.

```jsonc
{
  "model": {
    "main": { "model": "codex/gpt-6.1-sol", "thinking": "high" },
  },
}
```

Requires `ModelProviders`, `Credentials`, `LoginMethods` and `HttpClient`. To change how calls are sent, wrap `ModelCall`.
