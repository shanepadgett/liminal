# Status

What we are building, in order. Each milestone groups the work that ships together. A milestone's plugin work lives in its file in `plugins/` until it is done.

## Scope

- Build only what a milestone lists. Anything else goes under Later until the user asks for it.
- The simplest implementation that keeps the seams in [architecture.md](architecture.md).
- No tests until the test milestone.

## Current focus

Milestone 1. The stack is settled in [architecture.md](architecture.md#stack).

## Next

1. Scaffold: add the `packages/core` workspace and the lint boundary that keeps core, base plugins and `client` on `effect` only. Rewrite `tools/checks/plugin-anatomy.ts` for the new plugin anatomy when the first plugin is built.
2. Agree the `packages/core` API in [plugins/base.md](plugins/base.md), then build it.
3. Build the rest of milestone 1.

Planned dependencies are pinned in `tools/planned/package.json` so their docs are in `reference/copies/`. When a plugin is built, move its dependencies from `tools/planned` into the plugin's package.

## Milestones

### 1. Core and a turn

Work: [plugins/base.md](plugins/base.md)

- [ ] `packages/core`: `definePlugin`, `compose`, `Registry`, `Pipeline`, `Attribute`
- [ ] Base plugins: `model`, `session`, `tools`, `context`, `loop`
- [ ] `model-anthropic`, `model-scripted`
- [ ] `apps/cli` print mode: streams a reply to a prompt and runs one tool

### 2. TUI

Work: [plugins/tui.md](plugins/tui.md)

- [ ] `packages/client` with the session view
- [ ] `packages/tui`: renderer, slot tree, UI kit
- [ ] `chat`, `palette`, `theme`
- [ ] `session-sqlite`, `accounts`
- [ ] Daily chat in the TUI with saved sessions

### 3. Coding agent

Work: [plugins/coding.md](plugins/coding.md)

- [ ] `tools-files`, `tools-shell`, `tools-web`, `tool-output`
- [ ] `instructions`, `environment`
- [ ] `approvals`, `questions`
- [ ] Liminal works on its own repository

### 4. Providers and cost

Work: [plugins/providers.md](plugins/providers.md)

- [ ] `model-openai`, `model-codex`, `model-openrouter`, `model-opencode-go`
- [ ] `model-catalog`, `usage`, `cache-hints`, `session-name`

### 5. Long sessions and project features

Work: [plugins/features.md](plugins/features.md)

- [ ] `memory`
- [ ] `skills`, `references`, `vocabulary`
- [ ] `checks`, `commit`
- [ ] `tools-search`, `tools-execute`, `attention`

### 6. Annexes and the binary

Work: [plugins/hosting.md](plugins/hosting.md)

- [ ] `loader`: plugin folders, `plugins.json`, trust, hot reload
- [ ] `bun build --compile` binary that loads annexes
- [ ] Plugin author guides in `guides/`

### 7. Desktop

- [ ] `apps/desktop` on Electrobun with `web` parts for `chat`, `palette`, `theme`
- [ ] A web slot registry with the TUI's slot names; web libraries for markdown, highlighting and diffs

### 8. Server and embedding

Work: [plugins/hosting.md](plugins/hosting.md)

- [ ] `actors`, `http`, `session-postgres`
- [ ] `client` over HTTP, `@liminal/agent`, npm publishing
- [ ] The work order agent runs in the Fresh app

### 9. Tests

- [ ] Test backfill, starting from the contracts

## Later

## Open

- Electrobun 2.x ships its SDK through the Hutch devkit, not npm; the npm package is only a bootstrap. Whether the desktop app stays on Electrobun.
- File search tools (`grep`, `find`): whether they belong in `tools-files`, and whether they use a system `rg` or ship one.
