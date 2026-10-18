# Plugins

Every planned plugin, grouped by area. A plugin gets its own file once it has requirements of its own; the rest are one line here. Plugin rules are in [requirements/03-plugin-model.md](../requirements/03-plugin-model.md).

A plain chat runs on `session-log`, `session-store`, `agent-loop`, `context`, `models`, `credential-store`, `tools`, `settings` and one provider plugin. Every other plugin can be switched off on its own.

Status: **to plan** (listed only), **planned** (has requirements), **built**.

## Session

| Plugin | Does | Status |
| --- | --- | --- |
| [session-log](session-log.md) | Append, read and subscribe to a session's entries | built |
| [session-store](session-store.md) | Stores sessions in SQLite | built |
| session-fork | Starts a new session from a point in another | to plan |
| session-resume | Reopens a past session | to plan |
| session-list | Lists sessions | to plan |
| session-title | Names a session | to plan |
| session-export | Writes a session out as JSONL | to plan |
| session-search | Searches across sessions | to plan |
| checkpoints | Conversation save points to rewind to | to plan |
| [file-snapshots](file-snapshots.md) | Rolls files back when a session rewinds | planned |

## Turns

| Plugin | Does | Status |
| --- | --- | --- |
| [agent-loop](agent-loop.md) | Runs one turn | built |
| inbox | The composer and all sending: starts a turn when idle, queues steers and follow-ups while one runs | planned |
| retry | Retries failed model calls | to plan |
| cancel | Stops a running turn | to plan |
| usage | Counts tokens and cost | to plan |
| [questions](questions.md) | `ask_question`, the form and the answers | planned |

## Context

| Plugin | Does | Status |
| --- | --- | --- |
| [context](context.md) | Turns the log into model messages | built |
| [system-prompt](system-prompt.md) | The built-in base system prompt | built |
| [environment](environment.md) | Workspace, git, platform, shell, date and a two-level file listing | built |
| agents-files | `AGENTS.md` files from the repository root down to the workspace, on by default | planned |
| [notices](notices.md) | Session notices only the user sees, in the transcript | built |
| instruction-files | `.liminal/instructions/` files with `always` or `read-when` front matter | planned |
| [compaction](compaction.md) | Keeps the context within the model's window | planned |
| [cache-hints](cache-hints.md) | Marks prompt cache breakpoints | built |

## Models

| Plugin | Does | Status |
| --- | --- | --- |
| [models](models.md) | The seam every provider plugs into | built |
| [model-catalog](model-catalog.md) | Model details from the `models.dev` catalog, cached on disk | built |
| [model-anthropic](model-anthropic.md) | Providers `anthropic` (Claude subscription) and `anthropic-api` (API key) | built |
| [model-codex](model-codex.md) | Provider `codex`: OpenAI models on a ChatGPT plan login | built |
| [model-openai](model-openai.md) | Providers `openai` (API key) and `chatgpt` (Sign in with ChatGPT) | built |
| [model-openrouter](model-openrouter.md) | Provider `openrouter`: OpenRouter's models with an API key | built |
| [model-opencode-go](model-opencode-go.md) | Provider `opencode-go`: the OpenCode Go subscription with an API key | built |
| [decisions](decisions.md) | Decision models (Jev, Luna Decisions) answer questions with probabilities | built |
| one plugin per provider | Talks to one model provider | to plan |
| model-select | Chooses the model for a session | to plan |

## Credentials

| Plugin | Does | Status |
| --- | --- | --- |
| [credential-store](credential-store.md) | Stores secrets | built |
| [logins](logins.md) | The login methods provider plugins register, their flows and `/connect`; `credential-store` stays storage only | built |

## Tools

| Plugin | Does | Status |
| --- | --- | --- |
| [tools](tools.md) | The tools the model can call, how each call runs, and their guidance in the system prompt | built |
| [files](files.md) | Reads and writes workspace files for the file tools | built |
| [shell-safety](shell-safety.md) | Tells read-only shell commands apart from ones that can change things | built |
| permissions | Rules for what tools may do | to plan |
| [approval](approval.md) | Decides the tool calls a check asks about: decision model, reviewer, then the user | built |
| tool-output-spill | Moves large tool output to a file | to plan |
| checks | The checks tool, and runs the checks itself, with its own entry kind, when the model ends its turn without them | to plan |
| command-runner | Runs one command to its end, with a timeout | built |
| tools-read | `read`: a text file in windows of lines | built |
| tools-edit | `edit` replaces text that appears once in a file; `write` writes a whole file, with its folders | built |
| tools-shell | `shell` over the command runner | built |
| one plugin per tool family | Web and other tools | to plan |
| [processes](processes.md) | Commands that keep running across turns and restarts | planned |

## Settings

| Plugin | Does | Status |
| --- | --- | --- |
| [settings](settings.md) | Layered settings store and schemas; each plugin owns its settings UI parts | built |
| [trust](trust.md) | Asks the user to trust an untrusted workspace, in the composer's place | built |

## Plugin file shape

```markdown
# <plugin name>

One line on what it does.

Status: to plan | planned | built

## Provides       services and tools, by name
## Requires       services it needs
## Adds           entry kinds, TUI parts
## Requirements   terse bullets
## Open           unsettled items, including alternative names
## References     what was studied
```

Empty sections are left out.
