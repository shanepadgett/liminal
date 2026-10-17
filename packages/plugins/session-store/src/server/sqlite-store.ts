/** SessionStore over one SQLite database file. */

import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";

import { SessionStore } from "../contract.ts";
import { migrate } from "./migrations.ts";
import * as Queries from "./queries.ts";

/** WAL and the busy timeout are the driver's defaults; these settings are per connection. */
const configure = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`PRAGMA synchronous = NORMAL`;
  yield* sql`PRAGMA foreign_keys = ON`;
  yield* migrate;
});

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* configure;

  const run =
    (operation: string) =>
    <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      effect.pipe(Queries.storeFailure(operation), Effect.provideService(SqlClient.SqlClient, sql));

  return SessionStore.of({
    createSession: (id) => run("createSession")(Queries.createSession(id)),
    forkSession: (id, parent, seq) => run("forkSession")(Queries.forkSession(id, parent, seq)),
    saveEntries: (entries) => run("saveEntries")(sql.withTransaction(Queries.saveEntries(entries))),
    readEntries: (sessionId, range) => run("readEntries")(Queries.readEntries(sessionId, range)),
    lastSeq: (sessionId) => run("lastSeq")(Queries.lastSeq(sessionId)),
    readLive: (sessionId) => run("readLive")(Queries.readLive(sessionId)),
    writeLive: (sessionId, live) => run("writeLive")(Queries.writeLive(sessionId, live)),
  });
});

/** The store over the database at `filename`, migrated before first use. */
export const sqliteStore = (filename: string) =>
  Layer.effect(SessionStore, make).pipe(Layer.provide(SqliteClient.layer({ filename })));
