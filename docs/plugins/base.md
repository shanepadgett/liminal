# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `accounts`

- Credentials in its own table through `SqlClient`: API keys; OAuth tokens, refreshed inside a write transaction so one process refreshes; and commands whose output is the key, run once per process. With nothing saved, a provider reads its environment variable.
- A login method is an API key or a flow the provider runs. A flow is written against fixed actions: open a URL, show a code, ask, ask for a secret, show waiting, tell, and sign in through the browser.
- `LoginMethods` registry that providers add to.
- RPC group: the login methods, a sign-in stream that turns each action into a step for the screen, and `answer` for what the user types. `liminal connect` and the TUI's `/connect` show the steps.
- Previous code: `logins`, `credential-store`.

```ts
// model-anthropic adds its logins
LoginMethods.add({ provider: "anthropic", kind: "api-key" })
LoginMethods.add({ provider: "anthropic", kind: "oauth", run: anthropicOAuth })
```

## Model providers

- `model-anthropic`, `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go`: each adds a `ModelProvider` to `ModelProviders` and its logins to `LoginMethods`.
- The OpenAI Responses and Chat Completions wire code joins `@shanepadgett/liminal-model-wire`, beside Anthropic Messages.
- `model-anthropic` adds its API key and Claude subscription logins to `LoginMethods`; subscription requests are sent as Claude Code, with its identity line added on the way out. `model-codex` offers the ChatGPT plan login by browser or device code.
- Previous code: same names.

## `apps/cli`

- Add `accounts` and the other providers to its composition.
- `liminal connect` over `client`: interactive prompts pick a provider and a login method, then show the sign-in steps from `accounts` and send back what the user types.
- Print mode `--json`: saved events and deltas as JSON lines from the input to the turn's end.
- Exit codes: 0 answered, 1 failed or cancelled, 2 bad flags, 130 Ctrl-C after cancelling the turn.
