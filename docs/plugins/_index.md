# Plugins

Every planned plugin, grouped by area. A plugin gets its own file once it has requirements of its own; the rest are one line here. Plugin rules are in [requirements/03-plugin-model.md](../requirements/03-plugin-model.md).

A plain chat runs on `session-log`, `session-store`, `agent-loop`, `context`, `models`, `credential-store`, `tool-registry`, `tool-pipeline`, `settings` and one provider plugin. Every other plugin can be switched off on its own.

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
| [agent-loop](agent-loop.md) | Runs one turn | planned |
| inbox | Holds input sent while a turn runs | to plan |
| steering | Joins a steer into the running turn | to plan |
| retry | Retries failed model calls | to plan |
| cancel | Stops a running turn | to plan |
| usage | Counts tokens and cost | to plan |
| [questions](questions.md) | `ask_question`, the form and the answers | planned |

## Context

| Plugin | Does | Status |
| --- | --- | --- |
| [context](context.md) | Turns the log into model messages | planned |
| system-prompt | The base system prompt | to plan |
| instructions | Loads instruction files into the prompt | to plan |
| [compaction](compaction.md) | Keeps the context within the model's window | planned |
| cache-hints | Marks prompt cache breakpoints | to plan |

## Models

| Plugin | Does | Status |
| --- | --- | --- |
| models | The seam every provider plugs into | to plan |
| one plugin per provider | Talks to one model provider | to plan |
| model-catalog | Known models and their limits | to plan |
| model-select | Chooses the model for a session | to plan |

## Credentials

| Plugin | Does | Status |
| --- | --- | --- |
| credential-store | Stores secrets | to plan |
| one login plugin per provider or flow | OAuth or API key login | to plan |

## Tools

| Plugin | Does | Status |
| --- | --- | --- |
| tool-registry | Tools the model can call | to plan |
| tool-pipeline | Runs a tool call through its steps | to plan |
| permissions | Rules for what tools may do | to plan |
| approval | Asks the user before a tool runs | to plan |
| tool-output-spill | Moves large tool output to a file | to plan |
| checks | The checks tool, and runs the checks itself, with its own entry kind, when the model ends its turn without them | to plan |
| one plugin per tool family | File, shell, web tools | to plan |
| [processes](processes.md) | Commands that keep running across turns and restarts | planned |

## Settings

| Plugin | Does | Status |
| --- | --- | --- |
| settings | Layered settings store and schemas; each plugin owns its settings UI parts | to plan |

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
