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

/** Applies the migrations the database has not seen yet. */
export const migrate = SqliteMigrator.run({
  loader: SqliteMigrator.fromRecord({ "0001_create_tables": createTables }),
});
