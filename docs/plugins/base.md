# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `directories`

- `Directories`: `global` (`~/.liminal`), `workspace` (the folder Liminal works in), `project` (`<workspace>/.liminal`).
- `HOME` through Effect's `Config`, the working folder through `Path.resolve(".")`; the host supplies `Path`.
- Plugins that store files require it. A harness that keeps files elsewhere composes its own plugin that provides `Directories`.
- Previous code: `archive/packages/sdk/src/core/directories.ts`.

## `settings`

- A setting is one plugin's key in `settings.json`: `Setting.make(key, schema)`; the schema holds the defaults.
- `DeclaredSettings` registry: each plugin adds its setting. `Settings.get(setting)` reads on each call; `Settings.write(scope, path, value)`.
- `settings.json` in the global and project folders from `directories`, JSONC through `jsonc-parser`; project values win. `write` keeps comments and formatting.
- Plugins take no options of their own.
- Previous code: `settings`.

## `model`

- Message and part types, `Model`, `Models` registry, `ModelCall` pipeline, `Models.generate`.
- A model is named `provider/model`, such as `anthropic/claude-opus-5-5`, with an optional thinking level. `model`'s setting holds the roles `main` (turns) and `small` (side calls). Each provider names its default for both; `liminal connect` writes them when the roles are unset.
- Retries every model call whose `AiError` is retryable, waiting `retryAfter` when given; the attempt limit is in `model`'s setting. Viewers see a retry status, and a reply that fails partway is cleared and restarts. Out of attempts, the turn ends with a notice and the input stays. Every attempt counts toward usage.
- Owns the `Message` and `Part` schema the log stores and converts them to and from Effect AI's types in one place. The live reply stream and errors are Effect AI's `Response` parts and `AiError`.
- `Models.list` merges each provider's offered models with `model-catalog`'s details.
- Previous code: `models`, `decisions`.

```ts
Models.generate({ model: "small", prompt, schema })
  → resolve role → ModelCall.run(request) → schema ? decode : collect message
```

## `session`

- `SessionLog`: `open`, `append`, `page`, `live`, stored through `SqlClient`; live updates and the runner within one process.
- `Inbox.send`, `Send` pipeline, `Commands` registry, `defineEvent`.
- Notices are an event kind with `modelVisible: false`.
- Previous code: `session-log`, `session-store`, `inbox`, `notices`.

## `tools`

- `Tools` registry, `ToolCall` pipeline, a section listing tool guidance.
- Previous code: `tools`.

## `context`

- `Sections` registry, `History` pipeline that projects model-visible events into messages.
- Previous code: `context`.

## `loop`

- One turn as in [architecture.md](../architecture.md#base-plugins-the-agent); `TurnEnd` registry; cancel input.
- Previous code: `agent-loop`, `cancel`.

## `sqlite`

- Opens `liminal.db` in the global folder from `directories`, mode `0600`, in WAL mode so the CLI, TUI and desktop app share it.
- Provides Effect's `SqlClient` over `@effect/sql-sqlite-bun`. Every plugin that keeps state requires it and owns its tables and migrations.
- Previous code: `session-store`, `credential-store`.

## `accounts`

- Credentials in its own table through `SqlClient`: API keys, and OAuth tokens refreshed inside a write transaction so one process refreshes.
- `LoginMethods` registry that providers add to; `liminal connect` and the TUI's `/connect` run them.
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
- OpenAI-compatible wire code is a shared library, not a contract.
- Previous code: same names.

## `packages/client`

- `send`, `page`, `live`, `call` over plain function calls; no dependencies, types from contracts through `import type`; trusts the server's JSON.
- Previous code: `archive/packages/frontend`.

## `apps/cli`

- Composes the base plugins, `sqlite`, `accounts`, `model-catalog` and every provider, plus a few-line plugin of its own that hands in `BunServices.layer`: files, paths, processes and the terminal.
- Command line with `effect/cli`.
- `liminal connect`: interactive prompts pick a provider, then a login method, then take an API key or run the OAuth flow; credentials go to `accounts`.
- Print mode over `client`: `-p` streams the reply to stdout, `--json` writes session events as JSON lines, `--approve` lets questions and approvals pass.
