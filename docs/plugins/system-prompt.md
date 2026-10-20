# system-prompt

The built-in base instructions every session starts with.

Status: built

## Requires

- `PromptSections`

## Requirements

- One prompt section, `system-prompt/base`, at order 0
- The text tells the model to defer to the project's command line tools and use them as a person would: generate, never invent; anything a tool writes (lock files, build output, scaffolding, migrations, snapshots) comes from running the tool, or the model stops and tells the user
- The text is built into the plugin; users add to it through `AGENTS.md`; replacing it means replacing the plugin
