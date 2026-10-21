# Plan: milestone 1 plugins

The base plugins, storage, accounts, providers, `client` and `apps/cli` from [plugins/base.md](../plugins/base.md). Contracts: [architecture.md](../architecture.md#base-plugins-the-agent).

## Systems

| System | Change |
| --- | --- |
| `packages/plugins/{settings,model,session,tools,context,loop}` | Adds the base plugins: contracts and the behavior every host shares |
| `packages/plugins/{session-sqlite,accounts}` | Adds storage under `~/.liminal/` |
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

- Sessions: `session-sqlite` provides the whole `SessionLog`, including live updates and the runner. Base `session` owns the `SessionLog` contract, `Inbox`, `Send`, `Commands` and event kinds. A shared store contract would have to carry live updates and a runner for Postgres too.
- Settings: one base plugin, `settings`, reads and writes `settings.json` in the global and project folders through Effect's `FileSystem`, which the host supplies. A host whose settings live elsewhere composes its own plugin that provides `Settings` and `SettingsSections`.
- Folders: a host service, `Directories`, names the global and project folders. `settings`, `session-sqlite` and `accounts` read it, so each host decides where its files live.
- Credentials: one `accounts` plugin holds the `Credentials` and `LoginMethods` contract and the store. Providers import its contract. A host that keeps credentials elsewhere provides `Credentials` from its own plugin when that host is built.
- Credential file: SQLite at `~/.liminal/credentials.db`, mode `0600`. The CLI, TUI and desktop app can refresh the same expired token at once; a write transaction makes one of them do it. Pi locks a JSON file for the same reason.

## Open

Round 2: contract shapes.

- `Directories`: its fields and which package owns the tag.
- `settings`: `Settings`, `SettingsSections`, `SettingsInvalid`; whether `jsonc-parser`, a plain JavaScript library, may enter a base plugin, which otherwise uses only `effect`.
- `model`: `Part`, `Message`, `Model`, `ModelProvider`, `ModelDelta`, `ModelCall`, how a failed or retried call shows to the user, `Models.generate`.
