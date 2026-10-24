/** The stash tables, one migration per change, applied in id order. */
import { Effect } from "effect";
import { Migrator, SqlClient } from "effect/sql";

const createStashes = Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`
    CREATE TABLE stashes (
      id INTEGER PRIMARY KEY,
      folder TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      UNIQUE (folder, text)
    )
  `,
);

/** The texts the draft marked, as a JSON array. */
const addMarks = Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`ALTER TABLE stashes ADD COLUMN marks TEXT NOT NULL DEFAULT '[]'`,
);

/** Applies the migrations the database has not seen yet. */
export const migrate = Migrator.make({})({
  loader: Migrator.fromRecord({ "0001_create_stashes": createStashes, "0002_add_marks": addMarks }),
  table: "stash_migrations",
});
