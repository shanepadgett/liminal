---
read-when: writing or changing a file in `docs/`, or recording something future work depends on
---

# Documentation

- Start at `docs/_index.md`; it lists what each docs folder holds.
- `docs/requirements/` and the plugin files in `docs/plugins/` hold only requirements the user has explicitly agreed to. One terse bullet each, grouped by concept. No explanations, options, or commentary.
- When a chat produces something future work depends on (a later task, a finding a later step needs, a rule for how you work), record it in the same reply as one terse bullet in its existing home: a requirements, plugin, plan or `docs/status.md` file, or an instruction file with the user's approval. Record nothing else: no discussion, reasoning, research notes or summaries.
- Docs state only what is true now. Never write history or status words such as "decided", "agreed", "rejected" or "replaces"; unsettled items go only in an `Open` section.
- `docs/status.md` holds the current focus, next steps, open and later topics with the user's stated wants, and the Pi sessions map. Remove a topic once it is settled into a requirements or plugin file.
- When logging a requirement, add or update the `docs/status.md` Sessions line for the current `$PI_SESSION_ID`.
- Pi sessions for this repo live in `~/.pi/agent/sessions/--Users-shanepadgett-dev-open-source-liminal--/` as `<timestamp>_<session-id>.jsonl`; search them with `rg` or `jq` for the full discussion behind a decision.
- Do not create new documentation files or new kinds of documentation without first agreeing on their purpose and structure with the user.
