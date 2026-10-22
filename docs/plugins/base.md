# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `accounts`

Built: API keys and OAuth tokens per provider, `LoginMethods` with logins grouped by vendor and their ways, `LoginFlow` and `AccountsRpc`. Still to build:

- A command credential: a command whose output is the key, run once per process and kept in memory. `liminal connect` offers it as a login method that asks for the command.
- Logout: `Credentials.remove`, an optional `logOut` on a login method (Sign in with ChatGPT revokes its token), an `accounts/logout` RPC and `liminal connect` offering it for a connected provider.
- After connecting, `liminal connect` writes the provider's default `main` and `small` models into settings when the roles are unset, so connecting a second provider later does not change them. Until then an unset role uses the first signed-in provider's defaults.

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

- Built: `model-anthropic` with its API key and Claude subscription logins; `model-openai` with all three providers, and `gpt-6-luna` as `openai`'s classifier over the Decisions API, which takes only API keys.
- The Chat Completions wire code joins `@shanepadgett/liminal-model-wire`, beside Anthropic Messages, OpenAI Responses and OpenAI Decisions.
- `model-openrouter` lists Jev (`typesafe/jev-1.13`) as a classifier, through `@effect/ai-openrouter`'s `OpenRouterDecisionModel`.
- Sign in with ChatGPT limits that `chatgpt` does not handle yet: the API refuses uncompressed request bodies over about 1 MiB, which OpenCode compresses with zstd, and `model` retries errors such as `subscription_sharing_usage_limit_exceeded` that retrying cannot fix.
- Previous code: same names; the archive's `model-openrouter` and `model-opencode-go`.

## `apps/cli`

- Add the other providers to its composition.
