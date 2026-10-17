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
});

/** The session index, rebuilt from the log whenever `indexVersion` changes. */
const createIndex = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE session_index (
      session_id TEXT PRIMARY KEY REFERENCES sessions,
      updated_at INTEGER NOT NULL,
      last_seq INTEGER NOT NULL
    )
  `;

  yield* sql`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
});

/** Applies the migrations the database has not seen yet. */
export const migrate = SqliteMigrator.run({
  loader: SqliteMigrator.fromRecord({
    "0001_create_tables": createTables,
    "0002_create_index": createIndex,
  }),
});
