# session-log

Appends, reads and streams a session's entries.

Status: planned

## Provides

- `SessionLog` service: append, read, subscribe

## Requires

- `SessionStore`

## Adds

- Entry kinds: user message, assistant text, reasoning, tool call, tool result, turn and step boundaries

## Requirements

- Holds only the minimum mechanism; other plugins add their entry kinds through their contracts
- Entries are immutable and carry timestamps
- An entry is visible to subscribers only after it is saved
- Live state is watched by clients and becomes an entry when saved

## Open

- The contract: entry schema, how plugins register entry kinds, subscribe semantics

## References

- Pi `docs/session-format.md`
- Tau `src/session/Entry.ts`
- OpenCode `packages/schema`
