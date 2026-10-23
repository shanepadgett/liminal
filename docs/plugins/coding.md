# Milestone 3: coding agent

Work for [status.md](../status.md) milestone 3.

## `tools-read`, `tools-edit`, `tools-write`

- One plugin per tool, so one can be swapped, such as an OpenAI patch tool for `edit` and `write`. `tools-files` holds `read` today and splits into these before `edit` and `write` are built.
- `edit` events render as diffs through `chat`'s `ItemRenderer` with OpenTUI's `Diff`; patches come from `diff`.
- Shows an edit while its arguments stream, with `partial-json` only if Effect AI gives no partial tool arguments.
- `edit` diffs need display data beside what the model sees, such as Pi's `details`.
- Previous code: `files`, `tools-edit`.

## `tools-web`

- Adds `websearch`, `webfetch`.
- Previous code: `tools-web`.
