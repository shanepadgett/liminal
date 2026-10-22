# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `accounts`

Built: API keys and OAuth tokens per provider, `LoginMethods` with logins grouped by vendor and their ways, `LoginFlow` and `AccountsRpc`. Still to build:

- A command credential: a shell command whose output is the key, run once per process and kept in memory. Every API key login offers it as a second way, Command, beside the key. Sign-in runs the command once before saving it. `Credentials.key` gives a saved key or the command's output; a provider's signed-in check never runs the command.
- Logout: `Credentials.remove`, an optional `logOut` on a login method, an `accounts/logout` RPC that takes a provider, and `liminal logout`, which lists the connected providers. Sign in with ChatGPT and the Codex login revoke their refresh token. A failed revoke still removes the saved login, then says how to disconnect Liminal in ChatGPT settings.

## `model`

Built: chat models, roles, model details from `ModelCatalog`, `ModelCall`, `Models` and classifiers, as in [architecture.md](../architecture.md#classifiers).

## Model providers

- `model-anthropic`, `model-openai`, `model-openrouter`, `model-opencode-go`: each adds its providers to `ModelProviders` and its logins to `LoginMethods`.
- `model-openai` adds three providers under the vendor `OpenAI`, each with its own credential, so all three can be signed in at once: `openai` with an API key, `chatgpt` with Sign in with ChatGPT, and `codex` with the Codex login (in the browser or with a device code). All three take details from the catalog's `openai` entries.
- Default models, `main` and `small`:

  | Provider | `main` | `small` |
  | --- | --- | --- |
  | `model-anthropic` | `anthropic/claude-sonnet-5-5` | `anthropic/claude-haiku-5-5` |
  | `model-openai`: `openai` | `openai/gpt-6.1-sol` | `openai/gpt-6-luna` |
  | `model-openai`: `chatgpt` | `chatgpt/gpt-6.1-sol` | `chatgpt/gpt-6-luna` |
  | `model-openai`: `codex` | `codex/gpt-6.1-sol` | `codex/gpt-6-luna` |
  | `model-openrouter` | `openrouter/deepseek/deepseek-v4.1-flash-1017` | the same |
  | `model-opencode-go` | `opencode-go/deepseek-v4.1-flash` | the same |

- Built: `model-anthropic` with its API key and Claude subscription logins; `model-openai` with all three providers, and `gpt-6-luna` as `openai`'s classifier over the Decisions API, which takes only API keys; `model-openrouter` with an API key, its models from the catalog, and Jev (`typesafe/jev-1.13`) as a classifier through `@effect/ai-openrouter`'s `OpenRouterDecisionModel`; `model-opencode-go` with an API key, calling each model through the wire the catalog names for it.
- `@shanepadgett/liminal-model-wire` holds Anthropic Messages, OpenAI Responses, Chat Completions and OpenAI Decisions.
- Sign in with ChatGPT limits that `chatgpt` does not handle yet: the API refuses uncompressed request bodies over about 1 MiB, which OpenCode compresses with zstd, and `model` retries errors such as `subscription_sharing_usage_limit_exceeded` that retrying cannot fix.
- Previous code: same names; the archive's `model-openrouter` and `model-opencode-go`.

## `apps/cli`

- Built: its composition holds every provider.
