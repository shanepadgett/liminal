# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `accounts`

Built: API keys and OAuth tokens per provider, `LoginMethods`, `LoginFlow` and `AccountsRpc`. Still to build:

- A command credential: a command whose output is the key, run once per process and kept in memory. `liminal connect` offers it as a login method that asks for the command.
- Logout: `Credentials.remove`, an optional `logOut` on a login method (Sign in with ChatGPT revokes its token), an `accounts/logout` RPC and `liminal connect` offering it for a connected provider.
- After connecting, `liminal connect` writes the provider's default `main` and `small` models into settings when the roles are unset, so connecting a second provider later does not change them. Until then an unset role uses the first signed-in provider's defaults.

## `model`

Built: chat models, roles, `ModelCall` and `Models`. Still to build:

- Classifiers, as in [architecture.md](../architecture.md#classifiers): `Question` and `Answer` schemas, `ClassifyFailed`, `classifiers` and `classify` on `ModelProvider`, `Models.classify`, and `classifier` in `model`'s setting. Built with the first provider that has a classifier.

## Model providers

- `model-anthropic`, `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go`: each adds a `ModelProvider` to `ModelProviders` and its logins to `LoginMethods`.
- Default models, `main` and `small`:

  | Provider | `main` | `small` |
  | --- | --- | --- |
  | `model-anthropic` | `anthropic/claude-sonnet-5-5` | `anthropic/claude-haiku-5-5` |
  | `model-openai` | `openai/gpt-6.1-sol` | `openai/gpt-6-luna` |
  | `model-codex` | `codex/gpt-6.1-sol` | `codex/gpt-6-luna` |
  | `model-openrouter` | `openrouter/deepseek/deepseek-v4.1-flash-1017` | the same |
  | `model-opencode-go` | `opencode-go/deepseek-v4.1-flash` | the same |

- The OpenAI Responses and Chat Completions wire code joins `@shanepadgett/liminal-model-wire`, beside Anthropic Messages, as do the classifier wires: System One and OpenAI Decisions. The archive's are in `archive/packages/sdk/src/ai/decisions.ts`.
- Classifiers: `model-openrouter` lists Jev (`typesafe/jev-1.13`) over System One; `model-openai` lists `gpt-6-luna` over the Decisions API, only when signed in with an API key.
- `model-anthropic` is built with its API key and Claude subscription logins.
- `model-codex` offers the ChatGPT plan login as two methods: browser, with its callback on `localhost:1455`, and device code through `showCode` and `waiting`. The account id from the token goes in the credential's `extra`.
- `model-openai` offers Sign in with ChatGPT: browser only, with its callback on `127.0.0.1:1455`. The first login registers a client and keeps its id in `extra`; `Authorized` gains the reply's `client_id` for it. It revokes its token on logout.
- Previous code: same names.

## `apps/cli`

- Add the other providers to its composition.
- Print mode `--json`: saved events and deltas as JSON lines from the input to the turn's end.
- Exit codes: 0 answered, 1 failed or cancelled, 2 bad flags, 130 Ctrl-C after cancelling the turn.
