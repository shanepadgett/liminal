# Liminal

Liminal is a clean-room reimplementation and reimagining of `tau-agent`, focused on a better architecture rather than carrying forward its existing structure. Use the references to learn from their designs and tradeoffs; implement Liminal independently.

## Instructions

Read an instruction file only when you are about to change something it covers. Reading or discussing that area is not enough.

| Instruction | Read when |
| --- | --- |
| [instructions.md](docs/instructions/instructions.md) | Changing `AGENTS.md` or any file in `docs/instructions/`. |
| [code.md](docs/instructions/code.md) | Writing or changing code in `apps/`, `packages/` or `tools/`. |
| [planning.md](docs/instructions/planning.md) | Planning work, in chat or in `docs/plans/`. |
| [guides.md](docs/instructions/guides.md) | Writing or changing a file in `docs/guides/`. |
| [guides/](docs/guides/_index.md) | Building a plugin, TUI part, model provider or test; read the guide for that job first. |

## Grounding

- Never answer from memory alone when the answer is a matter of judgment or can change over time: APIs, versions, best practices, tool behavior, recommendations. Ground it in the codebase, `docs/reference/`, the reference repositories or a web search, and say which.

## Dependency docs

- Before writing or planning code against a dependency, find its entry in `docs/reference/copies/index.md` and read its docs and API there. Never guess an API.
- A new dependency starts at the latest stable release on the registry (`npm view <package> version`), never at a version copied from a reference repository.
- A new dependency or tool needs a source in `docs/reference/sources.json`. After adding one or changing a version, run `mise run docs`.

## Reference repositories

All references live under `/Users/shanepadgett/.local/share/tau-agent/references`. Resolve each repository as `<base>/<name>`.

- `tau-agent` — the original project being reimagined.
- `ai`
- `bubbletea`
- `codex`
- `crush`
- `deepseek-harness`
- `glow`
- `goose`
- `grok-build`
- `lipgloss`
- `mastra`
- `oh-my-pi`
- `opencode`
- `pi`

These coding harnesses are ongoing sources of architectural ideas and lessons. Keep them in consideration during research, choosing the relevant repositories for the question at hand.

Charm's `bubbletea`, `lipgloss`, `glow` and `crush` are the design reference for the TUI and gallery. Study how their components look and feel, not their Go implementation.

Treat all reference repositories as read-only examples. Search and read only the files needed for the current task; do not modify references or copy their implementation into Liminal.

## Documentation

- Start at `docs/_index.md`; it lists what each docs folder holds.
- `docs/requirements/` and the plugin files in `docs/plugins/` hold only requirements the user has explicitly agreed to. One terse bullet each, grouped by concept. No explanations, options, or commentary.
- When a chat produces something future work depends on (a later task, a finding a later step needs, a rule for how you work), record it in the same reply as one terse bullet in its existing home: a requirements, plugin, plan or `docs/status.md` file, or an instruction file with the user's approval. Record nothing else: no discussion, reasoning, research notes or summaries.
- Docs state only what is true now. Never write history or status words such as "decided", "agreed", "rejected" or "replaces"; unsettled items go only in an `Open` section.
- `docs/status.md` holds the current focus, next steps, open and later topics with the user's stated wants, and the Pi sessions map. Remove a topic once it is settled into a requirements or plugin file.
- When logging a requirement, add or update the `docs/status.md` Sessions line for the current `$PI_SESSION_ID`.
- Pi sessions for this repo live in `~/.pi/agent/sessions/--Users-shanepadgett-dev-open-source-liminal--/` as `<timestamp>_<session-id>.jsonl`; search them with `rg` or `jq` for the full discussion behind a decision.
- Do not create new documentation files or new kinds of documentation without first agreeing on their purpose and structure with the user.
