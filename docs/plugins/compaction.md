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
- A separate, cheaper model writes bounded summaries of entry ranges in the background, as short-term and long-term memories
- Memories are stored beside the log, not in it, and stay out of the context until a checkpoint
- At a checkpoint, memories replace the entries they cover, reminders included

## Open

- When a checkpoint is written and what it holds
- What short-term and long-term memories hold, and how they are built and folded
- Research what makes good memory management: Mastra and other short-term and long-term memory systems

## References

- Tau `src/core/ContextMethod.ts`
