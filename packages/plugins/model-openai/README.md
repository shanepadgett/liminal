# @shanepadgett/liminal-model-openai

OpenAI's models in `ModelProviders`, one provider for each way of signing in, each with its own login under OpenAI in `liminal connect`. All three can be signed in at once. Model details come from the `openai` entries in the model catalog.

| Provider | Login | Calls go to | Defaults: `main`, `small` |
| --- | --- | --- | --- |
| `openai` | An API key, else `OPENAI_API_KEY` | `api.openai.com/v1` | `openai/gpt-6.1-sol`, `openai/gpt-6-luna` |
| `chatgpt` | Sign in with ChatGPT, in the browser | `api.openai.com/v1`, on the ChatGPT plan | `chatgpt/gpt-6.1-sol`, `chatgpt/gpt-6-luna` |
| `codex` | Codex, in the browser or with a device code | The Codex backend, signed as the Codex CLI signs | `codex/gpt-6.1-sol`, `codex/gpt-6-luna` |

- A call without a login fails with an `AiError` that says to run `liminal connect`. OAuth tokens refresh when they near expiry.
- Logging out of `chatgpt` or `codex` revokes the refresh token at OpenAI.
- `openai` lists the models the API offers that the catalog lists as chat models. `chatgpt` and `codex` list the models the plan offers.
- `openai` offers `gpt-6-luna` as a classifier for `Models.classify`. The Decisions API takes only API keys, so `chatgpt` and `codex` offer none.
- Sign in with ChatGPT registers Liminal as its own app on the ChatGPT account on the first login, and checks each ID token against OpenAI's published keys. It names this machine with a host id kept in `~/.liminal/host-id`.
- Nothing is stored on OpenAI's side. Each call carries the whole conversation, and the session id goes along as the cache key.
- Thinking: `off`, or an effort level such as `low`, `medium`, `high` or `xhigh`. Unset leaves it to the model.

```jsonc
{
  "model": {
    "main": { "model": "codex/gpt-6.1-sol", "thinking": "high" },
  },
}
```

Requires `ModelProviders`, `ModelCatalog`, `Credentials`, `LoginMethods`, `Directories`, `HttpClient`, `FileSystem`, `Path` and `Crypto`. To change how calls are sent, wrap `ModelCall`.
