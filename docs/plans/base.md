# Plan: milestone 1 plugins

The base plugins, storage, accounts, providers, `client` and `apps/cli` from [plugins/base.md](../plugins/base.md). Contracts: [architecture.md](../architecture.md#base-plugins-the-agent).

## Systems

| System | Change |
| --- | --- |
| `packages/plugins/{directories,settings,model,session,tools,context,loop}` | Adds the base plugins: contracts and the behavior every host shares |
| `packages/plugins/{sqlite,accounts}` | Adds the database and credentials |
| `packages/plugins/model-*`, `model-catalog` | Adds the five archived providers and the models.dev catalog |
| `packages/client` | Adds `send`, `page`, `live`, `call` over function calls |
| `apps/cli` | Adds `liminal connect` and print mode |

## Storage today

How the archive split storage from behavior (`archive/packages/plugins/`):

| Concern | Behavior | Storage | Notes |
| --- | --- | --- | --- |
| Sessions | `session-log`: numbering, live updates over an in-process `PubSub`, entry kinds | `session-store`: `SessionStore` over SQLite, 12 methods | Live updates reach only the process that wrote |
| Settings | `settings`: one plugin reads files, merges layers and decodes sections | none separate | Global, then project once trusted, then launch flags |
| Credentials | `credential-store`: get, set, remove, `secret` with an env fallback, `fresh` refreshes OAuth | SQLite `credentials.db`, mode `0600` | The write lock spans read, refresh and save, so one process refreshes |
| Logins | `logins`: `LoginMethods` registry, API key and OAuth flows | none | Providers add their methods |

Prior art: Pi keeps `auth.json` at `0600` and takes a lock file around each OAuth refresh. OpenCode keeps `auth.json` at `0600` with no lock.

## Decisions

- Runtime services: Effect's own `FileSystem`, `Path` and the rest. Base plugins ask only for those, so they run on any runtime. `apps/cli` hands in `BunServices.layer` with a few-line plugin of its own; no package. The host guide covers it once built.
- One database: a `sqlite` plugin opens `liminal.db` in the global folder (mode `0600`, WAL so the CLI, TUI and desktop app share it) and provides Effect's `SqlClient`. Every plugin that keeps state requires it and owns its tables and migrations. A server swaps in `postgres`.
- Sessions: base `session` stores the log through `SqlClient`, with live updates and the runner within one process. Across server processes is open in [architecture.md](../architecture.md#open).
- Settings: one base plugin, `settings`, reads and writes `settings.json` in the global and project folders through Effect's `FileSystem`, which the host supplies. A host whose settings live elsewhere composes its own plugin that provides `Settings` and `DeclaredSettings`.
- Folders: a base plugin, `directories`, provides `Directories`; `settings` and `sqlite` require it, and a harness that stores files elsewhere replaces it.
- `Directories` fields: `global` (`~/.liminal`), `workspace` (the folder Liminal works in) and `project` (`<workspace>/.liminal`). `liminal.db` goes in `global`. Other folders arrive with their first caller.
- `settings` reads the global file, then the project file. Trust, which will gate project settings, comes later with `loader`.
- `settings` uses `jsonc-parser`, so `write` keeps the user's comments.
- A setting is one plugin's key in `settings.json`, made once with `Setting.make(key, schema)`. `Settings.get(setting)` reads it; plugins add theirs to the `DeclaredSettings` registry, which the milestone 2 settings screen lists.
- Credentials: one `accounts` plugin holds the `Credentials` and `LoginMethods` contract and the store. Providers import its contract. A host that keeps credentials elsewhere provides `Credentials` from its own plugin when that host is built.
- Credentials: `accounts` keeps its table in `liminal.db`. The CLI, TUI and desktop app can refresh the same expired token at once; a write transaction makes one of them do it. Pi locks a JSON file for the same reason.

- Retries: base `model` retries every model call, turns and one-off calls alike, when `AiError` says the error is retryable, waiting `retryAfter` when given. The user sees "Anthropic is overloaded, retrying in 4s (2/5)"; a reply that fails partway is cleared and restarts under that line. Out of attempts, the turn ends with a notice and the input stays. Esc cancels at any point, the wait included. Every attempt counts toward usage. The attempt limit is part of `model`'s setting.
- Choosing models: a model is named `provider/model`, such as `anthropic/claude-opus-5-5`, with an optional thinking level. `model`'s setting holds two roles, `main` for turns and `small` for side calls. Each provider names its default `main` and `small`; `liminal connect` writes them into settings when the roles are unset, so print mode works right after connecting.

- Types: `Message` and `Part` are Liminal's schemas, since the log stores them; base `model` converts them to and from Effect AI's types in one place, about 200 lines. The live reply stream and errors are Effect AI's `Response` parts and `AiError`. Effect AI marks its prompt types unstable, so storing them would mean migrations that each need a copy of the old schema.
- Model details: each provider says which models it offers, from `model-catalog`'s list for that provider and, for subscriptions, filtered to the account's plan. `model-catalog` supplies details from models.dev: name, context window, output limit, prices, thinking levels, image input. `Models.list` returns them merged, so `usage` computes cost from the same data.

## Open

- Round 4, `session`: event kinds and `defineEvent`, the inbox, `Send`, `Commands`, paging, live updates, one runner per session, crash recovery.
- Round 5, the turn (`tools`, `context`, `loop`): what the model sees, how tool calls run, when a turn ends, cancel.
- Round 6, `accounts` and the providers: `Credentials` and `LoginMethods`, the `liminal connect` flow, Claude and Codex subscription logins, the five providers.
- Round 7, `client` and `apps/cli`: send, page and watch over function calls; print mode output, `--json` and `--approve`.
