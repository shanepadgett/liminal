# Status

What we are building, in order. Each milestone groups the work that ships together. A milestone's plugin work lives in its file in `plugins/` until it is done.

## Scope

- Build only what a milestone lists. Anything else goes under Later until the user asks for it.
- Build only final code: no stand-in for something a later milestone builds. When work needs a later piece, move that piece earlier or defer the work.
- No in-memory or placeholder defaults. Each host composes its real plugins; a composition missing one fails with `MissingProvider`. Later milestones add plugins, never replace one built earlier.
- The simplest implementation that keeps the seams in [architecture.md](architecture.md).
- No tests until the test milestone.

## Current focus

Milestone 1. The stack is settled in [architecture.md](architecture.md#stack).

## Next

1. Milestone 1's plugins from [plugins/base.md](plugins/base.md) are planned in [plans/base.md](plans/base.md). Rounds 1–7 are in its Decisions: storage, folders, settings, credentials, retries, choosing models, types, model details, `session`, the turn with its plugins, accounts with the providers, and `client` with `apps/cli`.
2. Widen milestone 1: the rest of `accounts` (see [plugins/base.md](plugins/base.md#accounts)), the other providers, `--json` and exit codes. Built: `packages/core` (`definePlugin`, `compose`, `Registry`, `Pipeline`, `Attribute`), `directories`, `settings`, `sqlite`, `session`, `model`, `model-wire` with Anthropic Messages, `accounts` with API keys, OAuth tokens and the sign-in RPC, `model-anthropic` with its API key and Claude subscription logins and `ANTHROPIC_API_KEY` as fallback, `model-catalog` with models.dev details, `tools`, `history`, `system-prompt`, `persona`, `tool-definitions`, `loop`, `packages/client` with the in-memory `Host`, and `apps/cli` with `liminal -p`, which reads piped stdin, and `liminal connect`. A host composes a plugin of its own that provides Effect's runtime services, such as `Path`, `FileSystem` and `HttpClient`.

Planned dependencies are pinned in `tools/planned/package.json` so their docs are in `reference/copies/`. When a plugin is built, move its dependencies from `tools/planned` into the plugin's package.

## Milestones

### 1. Core and the CLI

Work: [plugins/base.md](plugins/base.md)

- [x] `packages/core`: `definePlugin`, `compose`, `Registry`, `Pipeline`, `Attribute`
- [x] Base plugins: `directories`, `settings`, `model`, `session`, `tools`, `tool-definitions`, `system-prompt`, `persona`, `history`, `loop`
- [x] `sqlite`
- [ ] `accounts`
- [ ] `model-catalog`, `model-anthropic`, `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go`
- [x] `packages/client`: `host.client(Group)` over in-memory RPC
- [ ] `apps/cli`: `liminal connect` saves credentials; print mode writes a reply with them

### 2. TUI

Work: [plugins/tui.md](plugins/tui.md)

- [ ] Session view in `packages/client`
- [ ] `packages/tui`: renderer, slot tree, UI kit
- [ ] `chat`, `palette`, `theme`
- [ ] Model picker and print mode `--model`
- [ ] `/connect` in the TUI
- [ ] Daily chat in the TUI with saved sessions

### 3. Coding agent

Work: [plugins/coding.md](plugins/coding.md)

- [ ] `tools-files`, `tools-shell`, `tools-web`, `tool-output`
- [ ] `instructions`, `environment`
- [ ] Recreate `.liminal/`; move `docs/instructions/` to `.liminal/instructions/` with `read-when` front matter
- [ ] `approvals`, `questions`
- [ ] Liminal works on its own repository

### 4. Cost and naming

Work: [plugins/providers.md](plugins/providers.md)

- [ ] `usage`, `cache-hints`, `session-name`

### 5. Long sessions and project features

Work: [plugins/features.md](plugins/features.md)

- [ ] `memory`
- [ ] `skills`, `references`, `vocabulary`
- [ ] `checks`, `commit`
- [ ] `tools-search`, `tools-execute`, `attention`

### 6. Bundles and the binary

Work: [plugins/hosting.md](plugins/hosting.md)

- [ ] `loader`: plugin folders, `plugins.json`, trust, reload
- [ ] `bun build --compile` binary that loads bundles
- [ ] Plugin author guides in `guides/`, including composing a host: handing in runtime services such as `BunServices.layer`

### 7. Desktop

- [ ] `apps/desktop` on Electrobun with `web` entries for `chat`, `palette`, `theme`
- [ ] A web slot registry with the TUI's slot names; web libraries for markdown, highlighting and diffs

### 8. Server and embedding

Work: [plugins/hosting.md](plugins/hosting.md)

- [ ] `actors`, `http`, `postgres`
- [ ] `client` over HTTP, `@shanepadgett/liminal-agent`, npm publishing
- [ ] The work order agent runs in the Fresh app

### 9. Tests

- [ ] Test backfill, starting from the contracts
- [ ] `model-scripted`: a provider that replays scripted replies, including tool calls, for tests. Previous code: `archive/packages/plugins/model-scripted`.

## Later

- MCP servers as a source of tools, connecting and disconnecting mid-session.
- Change notes as system-role messages where the model accepts them mid-conversation, as DeepSeek does; Effect AI's Anthropic provider has a per-model flag for it. Needs a `system` role in `Message`.

## Open

- Electrobun 2.x ships its SDK through the Hutch devkit, not npm; the npm package is only a bootstrap. Whether the desktop app stays on Electrobun.
- File search tools (`grep`, `find`): whether they belong in `tools-files`, and whether they use a system `rg` or ship one.
