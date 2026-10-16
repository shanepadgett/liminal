# Liminal

Liminal is a clean-room reimplementation and reimagining of `tau-agent`, focused on a better architecture rather than carrying forward its existing structure. Use the references to learn from their designs and tradeoffs; implement Liminal independently.

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
- Do not create new documentation files or new kinds of documentation without first agreeing on their purpose and structure with the user.
