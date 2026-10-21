# Milestone 1: core and the CLI

Work for [status.md](../status.md) milestone 1. Contracts are in [architecture.md](../architecture.md#base-plugins-the-agent).

## `settings`

- `SettingsSections` registry: each plugin adds its section name and Schema; the Schema holds the defaults.
- `Settings.section(name, schema)` reads on use; `Settings.write(scope, path, value)`.
- `settings.json` in the global and project folders from `Directories`, JSONC through `jsonc-parser`; project values win. `write` keeps comments and formatting.
- Plugins take no options of their own.
- Previous code: `settings`.

## `model`

- Message and part types, `Model`, `Models` registry, `ModelCall` pipeline, `Models.generate`.
- Roles `main` and `small` resolve to model ids from settings.
- Owns the `Message` and `Part` schema the log stores; providers convert at their edge.
- Previous code: `models`, `decisions`.

```ts
Models.generate({ model: "small", prompt, schema })
  → resolve role → ModelCall.run(request) → schema ? decode : collect message
```

## `session`

- The `SessionLog` contract: `open`, `append`, `page`, `live`. A storage plugin provides it.
- `Inbox.send`, `Send` pipeline, `Commands` registry, `defineEvent`.
- Notices are an event kind with `modelVisible: false`.
- Previous code: `session-log`, `inbox`, `notices`.

## `tools`

- `Tools` registry, `ToolCall` pipeline, a section listing tool guidance.
- Previous code: `tools`.

## `context`

- `Sections` registry, `History` pipeline that projects model-visible events into messages.
- Previous code: `context`.

## `loop`

- One turn as in [architecture.md](../architecture.md#base-plugins-the-agent); `TurnEnd` registry; cancel input.
- Previous code: `agent-loop`, `cancel`.

## `session-sqlite`

- Provides the whole `SessionLog` from SQLite under `~/.liminal/`: events, pages, live updates and the runner.
- Queries through `SqlClient`; the host supplies `@effect/sql-sqlite-bun`.
- Runner is an in-process lock.
- Previous code: `session-store`.

## `accounts`

- Credentials in SQLite at `~/.liminal/credentials.db`, mode `0600`: API keys, and OAuth tokens refreshed inside a write transaction so one process refreshes.
- `LoginMethods` registry that providers add to; `liminal connect` and the TUI's `/connect` run them.
- Previous code: `logins`, `credential-store`.

```ts
// model-anthropic adds its logins
LoginMethods.add({ provider: "anthropic", kind: "api-key" })
LoginMethods.add({ provider: "anthropic", kind: "oauth", run: anthropicOAuth })
```

## `model-catalog`

- Model names, context limits and prices from models.dev; providers read it, and `usage` in milestone 4.
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

- Composes the base plugins, `session-sqlite`, `accounts`, `model-catalog` and every provider.
- Command line with `effect/cli`.
- `liminal connect`: interactive prompts pick a provider, then a login method, then take an API key or run the OAuth flow; credentials go to `accounts`.
- Print mode over `client`: `-p` streams the reply to stdout, `--json` writes session events as JSON lines, `--approve` lets questions and approvals pass.
