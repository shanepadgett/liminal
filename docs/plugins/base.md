# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `loop`

- `Turns.request(id)`: the session's next model request, for side calls that share its cache.
- One turn as in [architecture.md](../architecture.md#base-plugins-the-agent); `BeforeCall` registry, whose hooks log records before each model call, such as change notes and reminders; `TurnEnd` registry; cancel input.
- Tool calls in one reply run at the same time unless one is marked `sequential`. Cancel logs the partial reply marked interrupted, gives unfinished tool calls cancelled results and returns queued inputs to the input box. A turn left unfinished by a crash is closed when the session next opens, with interrupted results and a notice.
- `Inbox`, `Send` pipeline, `Commands` registry. Each session's queue lives in memory.
- A command runs as soon as it is sent and is logged as `session/command`; one that changes the log waits for the running turn to end.
- Publishes `model`'s retry deltas; out of attempts, the turn ends with a notice and the input stays.
- Steer and follow-up: input sent during a turn either joins before the next model call or waits until the turn would end. A queued input can be pulled back until the turn takes it.
- Previous code: `agent-loop`, `cancel`, `inbox`.

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

## `packages/client`

- `host.client(Group)`: a client for a plugin's RPC group over Effect's in-memory client; IPC and HTTP come with the desktop app and `http`.
- Imports `effect`, core and plugin contracts.
- Previous code: `archive/packages/frontend`.

## `apps/cli`

- Composes the base plugins, `sqlite`, `accounts`, `model-catalog` and every provider, plus a few-line plugin of its own that hands in `BunServices.layer`: files, paths, processes and the terminal.
- Command line with `effect/cli`.
- `liminal connect` over `client`: interactive prompts pick a provider and a login method, then show the sign-in steps from `accounts` and send back what the user types.
- Print mode over `client`, using `send` and `live`: `-p` writes the final reply when the turn ends, with errors and notices on stderr; `--json` writes saved events and deltas as JSON lines from the input to the turn's end; piped stdin joins the prompt. Print mode reads the events it needs itself and always starts a new session.
- Exit codes: 0 answered, 1 failed or cancelled, 2 bad flags, 130 Ctrl-C after cancelling the turn.
- Bare `liminal` prints help.
