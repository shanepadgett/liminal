/** The session database schema, one migration per change, applied in id order. */

import { SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Effect } from "effect";
import { SqlClient } from "effect/sql";

const createTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES sessions,
      fork_seq INTEGER,
      created_at INTEGER NOT NULL
    )
  `;

  // The primary key serves last-seq and range reads, so the table needs no rowid or other index.
  yield* sql`
    CREATE TABLE entries (
      session_id TEXT NOT NULL REFERENCES sessions,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      at INTEGER NOT NULL,
      data TEXT NOT NULL,
      model TEXT,
      text TEXT NOT NULL,
      user TEXT NOT NULL,
      PRIMARY KEY (session_id, seq)
    ) WITHOUT ROWID
  `;

  yield* sql`
    CREATE TABLE live (
      session_id TEXT PRIMARY KEY REFERENCES sessions,
      kind TEXT NOT NULL,
      data TEXT NOT NULL
    )
  `;

  // The session index, rebuilt from the log whenever `indexVersion` changes.
  yield* sql`
    CREATE TABLE session_index (
      session_id TEXT PRIMARY KEY REFERENCES sessions,
      updated_at INTEGER NOT NULL,
      last_seq INTEGER NOT NULL
    )
  `;

  yield* sql`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;

  // Serves `lastEntriesOfKinds`: the newest entry of some kinds in each session.
  yield* sql`CREATE INDEX entries_kind ON entries (kind, session_id, seq)`;
});

/**
 * Each session's folder and name. Sessions saved before have no folder; each is named from its
 * first user message.
 */
const addWorkspaceAndTitle = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE sessions ADD COLUMN workspace TEXT NOT NULL DEFAULT ''`;
  yield* sql`ALTER TABLE sessions ADD COLUMN title TEXT NOT NULL DEFAULT ''`;
  yield* sql`CREATE INDEX sessions_workspace ON sessions (workspace)`;

  yield* sql`
    UPDATE sessions SET title = COALESCE((
      SELECT trim(
        CASE WHEN instr(t, char(10)) > 0 THEN substr(t, 1, instr(t, char(10)) - 1) ELSE t END,
        char(9, 13, 32)
      )
      FROM (
        SELECT trim(json_extract(e.data, '$.text'), char(9, 10, 13, 32)) AS t FROM entries e
        WHERE e.session_id = sessions.id AND e.kind = 'session-log/user'
        ORDER BY e.seq LIMIT 1
      )
    ), '')
  `;
});

/** The name the agent gives a session; the title stays the first user message. */
const addName = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''`;
});

/** Applies the migrations the database has not seen yet. */
export const migrate = SqliteMigrator.run({
  loader: SqliteMigrator.fromRecord({
    "0001_create_tables": createTables,
    "0002_workspace_and_title": addWorkspaceAndTitle,
    "0003_name": addName,
  }),
});
