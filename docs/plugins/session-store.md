# session-store

Stores sessions and their entries in SQLite.

Status: planned

## Provides

- `SessionStore` service

## Requirements

- SQLite through `bun:sqlite`, in WAL mode
- Holds the log and an index of session metadata rebuilt from the log
- The `SessionStore` contract ships a conformance suite every provider passes
- A fork reads its parent's entries up to a point instead of copying them

## Open

- Tables, indexes and where the database file lives

## References

- Codex `thread-store`
- DeepSeek Harness `packages/session`
- Crush `internal/session`
