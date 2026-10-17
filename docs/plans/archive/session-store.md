# session-store

Lets `session-log` save and read entries durably, so sessions survive a restart. Requirements are in [plugins/session-store.md](../../plugins/session-store.md); what `session-log` needs from the store is in [session-log.md](session-log.md).

## Tables

```sql
sessions (id TEXT PRIMARY KEY, parent_id TEXT REFERENCES sessions, fork_seq INTEGER, created_at INTEGER NOT NULL)
entries  (session_id TEXT NOT NULL REFERENCES sessions, seq INTEGER NOT NULL, kind TEXT NOT NULL,
          at INTEGER NOT NULL, data TEXT NOT NULL, model TEXT, text TEXT NOT NULL, user TEXT NOT NULL,
          PRIMARY KEY (session_id, seq)) WITHOUT ROWID
live     (session_id TEXT PRIMARY KEY REFERENCES sessions, kind TEXT NOT NULL, data TEXT NOT NULL)
```

- The primary key serves last-seq and range reads; no other index.
- A read takes the session's entries, then its parent's up to `fork_seq`, recursively.
- Pragmas: WAL, `synchronous = NORMAL`, `foreign_keys = ON`, busy timeout.
- Migrations use `Migrator.fromRecord`.

## Agreed

- The tables, fork read, pragmas and migrations above.
- `effect/sql`'s `SqlClient` with `@effect/sql-sqlite-bun` 4.0.5.
- One global `sessions.db` in the `Directories` data folder.
- The metadata index is built in step 5.
- The `(session_id, seq)` key is the only guard against a second process in step 1.
