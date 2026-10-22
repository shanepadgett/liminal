/** The tags tables, one migration per change, applied in id order. */
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";

const createTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE tag_uses (
      folder TEXT NOT NULL,
      tag TEXT NOT NULL,
      uses INTEGER NOT NULL,
      last_used BIGINT NOT NULL,
      PRIMARY KEY (folder, tag)
    )
  `;
});

/** Applies the migrations the database has not seen yet. */
export const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({ "0001_create_tables": createTables }),
  table: "tags_migrations",
});
