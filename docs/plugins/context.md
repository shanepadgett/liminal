# context

Builds what the model sees from a session's entries.

Status: planned

## Provides

- `Context` service: log to model messages, prompt sections

## Requires

- `SessionLog`

## Requirements

- System prompt, instructions, compaction and cache hints are separate plugins that add to the context

## Open

- The contract, and how prompt sections are ordered and registered

## References

- Tau `src/core/ContextMethod.ts`
