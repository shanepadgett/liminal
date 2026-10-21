# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `model`

- Message and part types, `Model`, `Models` registry, `ModelCall` pipeline, `Models.generate`.
- A model is named `provider/model`, such as `anthropic/claude-opus-5-5`, with an optional thinking level. `model`'s setting holds the roles `main` (turns) and `small` (side calls). Each provider names its default for both; `liminal connect` writes them when the roles are unset.
- Retries every model call whose `AiError` is retryable, waiting `retryAfter` when given; the attempt limit is in `model`'s setting. Viewers see a retry status, and a reply that fails partway is cleared and restarts. Out of attempts, the turn ends with a notice and the input stays. Every attempt counts toward usage.
- Owns the `Message` and `Part` schema the log stores and converts them to and from Effect AI's types in one place. The live reply stream and errors are Effect AI's `Response` parts and `AiError`.
- `Models.list` merges each provider's offered models with `model-catalog`'s details.
- Previous code: `models`, `decisions`.

```ts
Models.generate({ model: "small", prefix?, prompt, schema })
  → resolve role → prefix + prompt → ModelCall.run(request) → schema ? decode : collect message
```

## `session`

- Event kind `session/message` holds `model`'s `Message`, role and parts; add it in the `model` step. Built: the log, `defineEvent`, `Notice` and the `live` RPC group.
- Previous code: `session-log`.

## `tools`

- `Tools` registry, `ToolCall` pipeline. Each tool carries a description, optional guidance, an optional `deferred` mark and an optional `sequential` mark; a tool result lists the tools it loads.
- Previous code: `tools`.

## `tool-definitions`

- `ToolDefinitions` pipeline: each tool's name, description and input shape as the model sees them. A plugin wraps it to change a description without replacing the tool.
- Adds a section to `system-prompt` from each tool's optional guidance.
- Logs tools added or removed mid-session. A removed tool is still sent, with a note, until the next fold.
- Tool definitions are logged at session start; a change is logged as a note before the next model call; a fold rebuilds them.
- Previous code: `tools`.

## `system-prompt`

- `Sections` registry. Logs the system prompt built from the sections at session start, logs a change note before the next model call when a section's text changes, and offers `fold`, which logs a new system prompt. It never decides when to fold.
- Previous code: `context`.

## `persona`

- One section: who the agent is and how it talks.
- Previous code: `context`.

## `history`

- `Converters` registry: one converter per event kind turns its events into model messages; a kind with no converter never reaches the model. Each plugin adds converters for its own kinds; `history` adds the one for `session/message`.
- `History` pipeline: the log, through the converters, into the messages each model call sends.
- Previous code: `context`.

## `loop`

- `Turns.request(id)`: the session's next model request, for side calls that share its cache.
- One turn as in [architecture.md](../architecture.md#base-plugins-the-agent); `BeforeCall` registry, whose hooks log records before each model call, such as change notes and reminders; `TurnEnd` registry; cancel input.
- Tool calls in one reply run at the same time unless one is marked `sequential`. Cancel logs the partial reply marked interrupted, gives unfinished tool calls cancelled results and returns queued inputs to the input box. A turn left unfinished by a crash is closed when the session next opens, with interrupted results and a notice.
- `Inbox`, `Send` pipeline, `Commands` registry. Each session's queue lives in memory.
- A command runs as soon as it is sent and is logged as `session/command`; one that changes the log waits for the running turn to end.
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

## `model-catalog`

- Model details from models.dev: name, context window, output limit, prices, thinking levels, image input. Providers read its list for their models; `usage` reads prices in milestone 4.
- Previous code: `model-catalog`.

## Model providers

- `model-anthropic`, `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go`: each adds a `ModelProvider` to `Models` and its logins to `LoginMethods`.
- `model-anthropic` is built on Effect AI's Anthropic provider.
- The Anthropic Messages, OpenAI Responses and Chat Completions wire code is a shared library, `@shanepadgett/liminal-model-wire`, not a contract.
- `model-anthropic` offers an API key and the Claude subscription login; subscription requests are sent as Claude Code, with its identity line added on the way out. `model-codex` offers the ChatGPT plan login by browser or device code.
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
