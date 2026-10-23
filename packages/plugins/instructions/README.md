# @shanepadgett/liminal-instructions

The user's instructions as system prompt sections, read again before each model call.

- `instruction-files` (`order` 10): Markdown files in `~/.liminal/instructions/` and `<workspace>/.liminal/instructions/`. A project file replaces a global one with the same name. Front matter decides how the model gets a file:
  - `always: true`: the whole text, in every prompt.
  - `read-when: <situation>`: only the path and the situation; the model reads the file when the situation comes up.
- `agents-files` (`order` 0): `AGENTS.md` files, once `instructions.agentsFiles` is `true` in `settings.json`. They come in this order: `~/.agents/AGENTS.md`, `~/.liminal/AGENTS.md`, then each folder from the repository root down to the workspace.

A file that fails to read, or an instruction file without a rule in its front matter, is left out, and the session gets one warning notice for it.

Requires `Sections`, `Directories`, `Settings`, `DeclaredSettings` and `SessionLog`.

```md
---
read-when: Writing or changing code in `packages/`
---

# Code

- Rules for the model.
```
