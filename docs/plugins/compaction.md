# compaction

Keeps the context within the model's window.

Status: planned

## Requires

- `Context`, `SessionLog`

## Adds

- A checkpoint entry kind

## Requirements

- Follows Tau: the agent writes its own checkpoint and continues, never waiting on a summary step
- Changes only what the model sees; visible history is never removed

## Open

- When a checkpoint is written and what it holds

## References

- Tau `src/core/ContextMethod.ts`
