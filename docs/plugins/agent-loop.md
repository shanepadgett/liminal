# agent-loop

Runs one turn: model calls and the tool calls they ask for, step by step, until a final answer or a question form.

Status: planned

## Provides

- `AgentLoop` service

## Requires

- `SessionLog`, `Context`, `Models`, `ToolRegistry`, `ToolPipeline`

## Requirements

- Unfinished output is saved about every 100 ms while it streams
- A running turn resumes after a restart
- Tools declare whether they are safe to rerun; an unsafe one reports as interrupted on resume
- A turn that stops on an error saves nothing about the failure; the next message continues from the log
- In-flight turns finish on the plugin graph they started on
- Inbox, steering, retry, cancel and usage are separate plugins

## Open

- The contract, and the extension points the turn plugins hook into

## References

- Pi `packages/durable` (`docs/spec.md`)
- Codex `app-server-protocol` v2
