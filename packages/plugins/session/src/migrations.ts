/** The session tables, one migration per change, applied in id order. */
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";

const createTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      attributes TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE session_events (
      session_id TEXT NOT NULL REFERENCES sessions,
      seq INTEGER NOT NULL,
      at BIGINT NOT NULL,
      kind TEXT NOT NULL,
      data TEXT NOT NULL,
      attributes TEXT NOT NULL,
      PRIMARY KEY (session_id, seq)
    )
  `;
});

/** Applies the migrations the database has not seen yet. */
export const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({ "0001_create_tables": createTables }),
  table: "session_migrations",
});
