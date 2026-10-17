# context

Builds what the model sees from a session's entries.

Status: planned

## Provides

- `Context` service: log to model messages, prompt sections

## Requires

- `SessionLog`

## Adds

- Entry kinds: context message, system prompt and tools

## Requirements

- System prompt, instructions, compaction and cache hints are separate plugins that add to the context
- Builds model messages from the text saved on each entry; needs no converter per entry kind
- A shared context message kind holds a plugin's label, its text and a show or hide setting on each entry; plugins use it for nudges, notices and similar messages
- The system prompt and tool list live in the log: the first request saves every prompt section and tool, later entries add, replace or remove sections and tools, and each checkpoint saves a full copy as the new start
- The context stays append-only between checkpoints

## Open

- The contract, and how prompt sections are ordered and registered

## References

- Tau `src/core/ContextMethod.ts`, `src/session/Reminder.ts`
- Pi `docs/session-format.md`: system messages, `custom_message`, `context_edit`
- OpenCode `session.synthetic`, `session.instructions.updated`
- Goose `MessageMetadata`: `user_visible`, `agent_visible`
