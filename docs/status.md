# Status

What we are building, in order. Each milestone groups the work that ships together. A milestone's plugin work lives in its file in `plugins/` until it is done.

## Scope

- Build only what a milestone lists. Anything else goes under Later until the user asks for it.
- Build only final code: no stand-in for something a later milestone builds. When work needs a later piece, move that piece earlier or defer the work.
- No in-memory or placeholder defaults. Each host composes its real plugins; a composition missing one fails with `MissingProvider`. Later milestones add plugins, never replace one built earlier.
- The simplest implementation that keeps the seams in [architecture.md](architecture.md).
- No tests until the test milestone.

## Current focus

Milestone 2. The stack is settled in [architecture.md](architecture.md#stack).

## Next

1. Plan milestone 2 from [plugins/tui.md](plugins/tui.md) in rounds, in `plans/tui.md`. The gallery's plan is in [plans/_archive/gallery.md](plans/_archive/gallery.md); its approval and question designs wait for milestone 3. Milestone 1's plan is in [plans/_archive/base.md](plans/_archive/base.md).
2. Built: `packages/core` (`definePlugin`, `compose`, `Registry`, `Pipeline`, `Attribute`), `directories`, `settings`, `sqlite`, `session`, `model` with classifiers over Effect AI's `Decision`, `model-wire` with Anthropic Messages, OpenAI Responses, Chat Completions and OpenAI Decisions, `accounts` with API keys, command credentials, OAuth tokens, logins grouped by vendor, the sign-in RPC and logout, `model-anthropic` with its API key and Claude subscription logins and `ANTHROPIC_API_KEY` as fallback, `model-openai` with `openai` (API key, `OPENAI_API_KEY` as fallback, GPT-6 Luna as classifier), `chatgpt` (Sign in with ChatGPT) and `codex` (Codex login), `model-openrouter` (API key, `OPENROUTER_API_KEY` as fallback, Jev as classifier), `model-opencode-go` (API key, `OPENCODE_API_KEY` as fallback, each model on the wire the catalog names), `model-catalog` providing `model`'s `ModelCatalog` from models.dev, `tools`, `history`, `system-prompt`, `persona`, `tool-definitions`, `loop`, `packages/client` with the in-memory `Host`, and `apps/cli` with `liminal -p`, which reads piped stdin, writes JSON lines with `--json` and sets exit codes, `liminal connect` and `liminal logout`. A host composes a plugin of its own that provides Effect's runtime services, such as `Path`, `FileSystem` and `HttpClient`.

Planned dependencies are pinned in `tools/planned/package.json` so their docs are in `reference/copies/`. When a plugin is built, move its dependencies from `tools/planned` into the plugin's package.

## Milestones

### 1. Core and the CLI

- [x] `packages/core`: `definePlugin`, `compose`, `Registry`, `Pipeline`, `Attribute`
- [x] Base plugins: `directories`, `settings`, `model`, `session`, `tools`, `tool-definitions`, `system-prompt`, `persona`, `history`, `loop`
- [x] `sqlite`
- [x] `accounts`
- [x] `model-catalog`, `model-anthropic`, `model-openai`, `model-openrouter`, `model-opencode-go`
- [x] `packages/client`: `host.client(Group)` over in-memory RPC
- [x] `apps/cli`: `liminal connect` saves credentials; print mode writes a reply with them

### 2. TUI

Work: [plugins/tui.md](plugins/tui.md)

- [x] `apps/gallery`: tokens, primitives, components and screens designed in their states
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
- [ ] Settle the database schema: after this, a schema change adds a migration, and the one-migration rule in `docs/instructions/code.md` is removed

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
- A turn that ends in structured output: the final answer, after any tool use, must decode through a schema the prompt gives, as OpenCode's `format` option does. `Models.generateObject` covers one-off calls.
- Sign in with ChatGPT limits `chatgpt` does not handle: the API refuses uncompressed request bodies over about 1 MiB, which OpenCode compresses with zstd, and `model` retries errors such as `subscription_sharing_usage_limit_exceeded` that retrying cannot fix.
- A session event when the model changes mid-session, as Pi and OpenCode log, so the transcript shows where it switched.
- Image generation built in: when a signed-in provider offers an image model, a simple way to make an image with it.

## Open

- Electrobun 2.x ships its SDK through the Hutch devkit, not npm; the npm package is only a bootstrap. Whether the desktop app stays on Electrobun.
- File search tools (`grep`, `find`): whether they belong in `tools-files`, and whether they use a system `rg` or ship one.
