# Liminal

Liminal is a clean-room reimplementation and reimagining of `tau-agent`, focused on a better architecture rather than carrying forward its existing structure. Use the references to learn from their designs and tradeoffs; implement Liminal independently.

## Instructions

Read an instruction file only when you are about to change something it covers. Reading or discussing that area is not enough.

| Instruction | Read when |
| --- | --- |
| [instructions.md](docs/instructions/instructions.md) | Changing `AGENTS.md` or any file in `docs/instructions/`. |
| [code.md](docs/instructions/code.md) | Writing or changing code in `apps/`, `kernel/`, `sdk/`, `plugins/` or `tools/`. |
| [planning.md](docs/instructions/planning.md) | Planning work, in chat or in `docs/plans/`. |

## Grounding

- Never answer from memory alone when the answer is a matter of judgment or can change over time: APIs, versions, best practices, tool behavior, recommendations. Ground it in the codebase, `docs/reference/`, the reference repositories or a web search, and say which.

## Dependency docs

- Before writing or planning code against a dependency, find its entry in `docs/reference/copies/index.md` and read its docs and API there. Never guess an API.
- A new dependency or tool needs a source in `docs/reference/sources.json`. After adding one or changing a version, run `mise run docs`.

## Reference repositories

All references live under `/Users/shanepadgett/.local/share/tau-agent/references`. Resolve each repository as `<base>/<name>`.

- `tau-agent` — the original project being reimagined.
- `ai`
- `codex`
- `crush`
- `deepseek-harness`
- `goose`
- `grok-build`
- `mastra`
- `oh-my-pi`
- `opencode`
- `pi`

These coding harnesses are ongoing sources of architectural ideas and lessons. Keep them in consideration during research, choosing the relevant repositories for the question at hand.

Treat all reference repositories as read-only examples. Search and read only the files needed for the current task; do not modify references or copy their implementation into Liminal.

## Documentation

- `DECISIONS.md` holds only decisions the user has explicitly agreed to. One terse bullet per decision, grouped by concept. No explanations, goals, options, or commentary.
- `TOPICS.md` lists open discussion topics, one terse bullet each with the user's stated wants. Remove a topic once it is settled into `DECISIONS.md`.
- `SESSIONS.md` maps Pi session IDs to the `DECISIONS.md` and `TOPICS.md` sections they discussed, one line per session. When logging a decision, add or update the line for the current `$PI_SESSION_ID`.
- Pi sessions for this repo live in `~/.pi/agent/sessions/--Users-shanepadgett-dev-open-source-liminal--/` as `<timestamp>_<session-id>.jsonl`; search them with `rg` or `jq` for the full discussion behind a decision.
- Do not create new documentation files or new kinds of documentation without first agreeing on their purpose and structure with the user.
