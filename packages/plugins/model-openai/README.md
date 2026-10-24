# @shanepadgett/liminal-model-openai

OpenAI's models in `ModelProviders`, one provider for each way of signing in, each with its own login under OpenAI in `liminal connect`. Both can be signed in at once. Model details come from the `openai` entries in the model catalog.

| Provider | Login | Calls go to | Defaults: `main`, `small` |
| --- | --- | --- | --- |
| `openai` | An API key, else `OPENAI_API_KEY` | `api.openai.com/v1` | `openai/gpt-6.1-sol`, `openai/gpt-6-luna` |
| `codex` | Codex, in the browser or with a device code | The Codex backend, signed as the Codex CLI signs | `codex/gpt-6.1-sol`, `codex/gpt-6-luna` |

- A call without a login fails with an `AiError` that says to run `liminal connect`. OAuth tokens refresh when they near expiry.
- Logging out of `codex` revokes the refresh token at OpenAI.
- The Codex backend answers only streamed requests, so `codex` streams structured output too and keeps the response the stream ends on.
- `openai` lists the models the API offers that the catalog lists as chat models. `codex` lists the models the plan offers, each with the context window the plan serves, such as 272K, smaller than the model's full window.
- `openai` offers `gpt-6-luna` as a classifier for `Models.classify`. The Decisions API takes only API keys, so `codex` offers none.
- Nothing is stored on OpenAI's side. Each call carries the whole conversation, and the session id goes along as the cache key.
- Thinking: `off`, or an effort level such as `low`, `medium`, `high` or `xhigh`. Unset leaves it to the model.
- Tool changes mid-conversation go as `additional_tools` items for GPT-5.4 and later on `openai`, and GPT-5.6 and later on `codex`. Other models get a note.

```jsonc
{
  "model-choice": {
    "default": { "model": "codex/gpt-6.1-sol", "thinking": "high" },
  },
}
```

Requires `ModelProviders`, `ModelCatalog`, `Credentials`, `LoginMethods` and `HttpClient`. To change how calls are sent, wrap `ModelCall`.
