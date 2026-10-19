/**
 * `stashes.db`: the drafts the user parks with ctrl+s, one list per workspace folder, until `/pop`
 * brings one back or discards it.
 */

import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { whileLocked } from "@liminal/sdk";

import { type Stash, type Stashed, StashesError } from "../contract.ts";

export class Stashes extends Context.Service<
  Stashes,
  {
    /** The folder's stashes, newest first. */
    readonly list: (folder: string) => Effect.Effect<ReadonlyArray<Stash>, StashesError>;
    readonly add: (folder: string, text: string) => Effect.Effect<Stashed, StashesError>;
    readonly remove: (id: number) => Effect.Effect<void, StashesError>;
  }
>()("liminal/inbox/Stashes") {}

const createTable = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE stashes (
      id INTEGER PRIMARY KEY,
      folder TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (folder, text)
    )
  `;
});

const Row = Schema.Struct({ id: Schema.Int, text: Schema.String, createdAt: Schema.Int });

const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row));

const stashOf = (row: typeof Row.Type): Stash => ({
  id: row.id,
  text: row.text,
  createdAt: DateTime.makeUnsafe(row.createdAt),
});

/** Waits out locks, and words any failure as the store's. */
const guarded = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    whileLocked,
    Effect.mapError((error) => new StashesError({ message: `stashes.db: ${error.message}` })),
  );

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* whileLocked(
    SqliteMigrator.run({ loader: SqliteMigrator.fromRecord({ "0001_stashes": createTable }) }),
  );

  const list = (folder: string) =>
    guarded(
      Effect.flatMap(
        sql`
          SELECT id, text, created_at AS createdAt FROM stashes
          WHERE folder = ${folder} ORDER BY id DESC
        `,
        decodeRows,
      ),
    ).pipe(Effect.map((rows) => rows.map(stashOf)));

  const add = (folder: string, text: string) =>
    guarded(
      Effect.flatMap(DateTime.now, (now) =>
        sql`
          INSERT INTO stashes (folder, text, created_at)
          VALUES (${folder}, ${text}, ${DateTime.toEpochMillis(now)})
          ON CONFLICT (folder, text) DO NOTHING
          RETURNING id
        `.pipe(Effect.map((rows): Stashed => (rows.length === 0 ? "duplicate" : "stashed"))),
      ),
    );

  return Stashes.of({
    list,
    add,
    remove: (id) => guarded(sql`DELETE FROM stashes WHERE id = ${id}`).pipe(Effect.asVoid),
  });
});

/** The stashes kept in the database at `filename`, migrated before first use. */
export const stashesLayer = (filename: string) =>
  Layer.effect(Stashes, make).pipe(Layer.provide(SqliteClient.layer({ filename, busyTimeout: 0 })));
