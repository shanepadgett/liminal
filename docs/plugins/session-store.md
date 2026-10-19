# session-store

Stores sessions and their entries in SQLite.

Status: built

## Provides

- `SessionStore` service

## Requirements

- SQLite through `effect/sql`'s `SqlClient` with the `@effect/sql-sqlite-bun` driver, in WAL mode
- One global `sessions.db` in the `Directories` data folder
- Migrations live in code, not files, so they run from a compiled binary
- Entries are keyed by `(session, seq)`; a second process appending the same seq fails with `StoreError`
- Holds the log and an index of session metadata rebuilt from the log; the index is dropped and rebuilt when its version changes
- The `SessionStore` contract ships a conformance suite every provider passes
- A fork reads its parent's entries up to a point instead of copying them
- Creates sessions, and forks as sessions with a parent and a cut point
- Keeps one live slot per session, overwritten on each update
- Each session records the workspace folder it was started in and a title; a fork copies both
- A session's title is set once, from the first line of its first user message
- Lists sessions by workspace folder, newest first
- Reads the own entries of given kinds in every folder's sessions saved to since a given time

## Open

- Whether to lock sessions across processes, as Crush and DeepSeek do, once the step 5 protocol settles how many servers share a data folder

## References

- Codex `thread-store`: JSONL log plus a derived SQLite index in the global home (`state_5.sqlite`), backed up and rebuilt when corrupt
- DeepSeek Harness `packages/session`: one JSONL log per session, required root with no cwd default, single writer per session with `flock`
- Crush `internal/session`, `internal/db`: one `crush.db` per project with WAL, `busy_timeout`, foreign keys and a data-folder lock
- OpenCode `core/src/event/sql.ts`, `database/`: one global database with an `event` table keyed by aggregate and `seq`, over `effect/sql` with its own `bun:sqlite` driver
