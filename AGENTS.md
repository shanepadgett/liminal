# Liminal

Liminal is an agent harness where everything is a plugin, built on Effect and Bun.

## Start here

Read `docs/status.md` first: the current milestone, next steps and open questions. Read anything else only when the task needs it.

| Read | When |
| --- | --- |
| `docs/architecture.md` | Planning or writing code; only the sections the task touches |
| The milestone's `docs/plugins/` work file | Building that milestone's plugins; only that plugin's section |
| `docs/plugin-sop.md` | Building a plugin |
| `docs/extension-basics.md` | Choosing between Add, Wrap, Attach and Replace |
| `docs/_index.md` | Adding, moving or deleting a doc |
| `archive/` | Checking how the previous implementation did something; read-only, never imported |

## Scope

- Architecture and long-term health come first. Never bend a seam to get something working.
- Build only what the current milestone lists; anything else goes under Later in `status.md` until the user asks for it.
- Solve the common case. No mechanism, option or special case for an edge case few users hit.
- No tests until the test milestone.

## Dependencies

- Before writing code against a dependency, read its entry in `docs/reference/copies/index.md`. Never guess an API.
- A new dependency starts at the latest stable release (`npm view <package> version`) and needs a source in `docs/reference/sources.json`; then run `mise run docs`.

## Docs

- When the user agrees to something, record it in the same reply: design in `architecture.md`, plugin work in its `docs/plugins/` file, focus, next steps and open questions in `status.md`.
- Keep `status.md` current so the next chat knows where to start.
- Docs state only what is true now. Unsettled items go in an `Open` section.
- Agree on the purpose of a new doc with the user before creating it.
