import { DateTime, Effect, Schema } from "effect";
/** Queries over the session tables. */
import * as Arr from "effect/Array";
import type { SqlClient } from "effect/sql";

import { Attributes } from "@shanepadgett/liminal-core";

import {
  type NewEvent,
  type Seq,
  type SessionEvent,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
} from "./contract.ts";

type Sql = SqlClient.SqlClient;

/** An event as a `session_events` row. */
const Row = Schema.Struct({
  session_id: SessionId,
  seq: Schema.Int,
  at: Schema.DateTimeUtcFromMillis,
  kind: Schema.String,
  data: Schema.fromJsonString(Schema.Json),
  attributes: Schema.fromJsonString(Attributes),
});

const AttributesText = Schema.fromJsonString(Attributes);

const failed = (error: { readonly message: string }) =>
  new SessionStoreFailed({ message: `The session store failed: ${error.message}` });

const toEvent = ({ session_id, ...rest }: typeof Row.Type): SessionEvent => ({
  session: session_id,
  ...rest,
});

const decodeRows = (rows: ReadonlyArray<unknown>) =>
  Effect.forEach(rows, (row) =>
    Effect.map(Effect.mapError(Schema.decodeUnknownEffect(Row)(row), failed), toEvent),
  );

const requireSession = (sql: Sql, session: SessionId) =>
  Effect.mapError(sql`SELECT id FROM sessions WHERE id = ${session}`, failed).pipe(
    Effect.filterOrFail(
      (rows) => rows.length > 0,
      () => new SessionNotFound({ session, message: `No session ${session} exists.` }),
    ),
    Effect.asVoid,
  );

export const create = Effect.fn("SessionStore.create")(function* (
  sql: Sql,
  attributes: Attributes,
) {
  const id = SessionId.make(crypto.randomUUID());
  const now = yield* DateTime.now;
  const encoded = yield* Effect.mapError(Schema.encodeEffect(AttributesText)(attributes), failed);
  const row = { id, created_at: now.epochMilliseconds, attributes: encoded };

  yield* Effect.mapError(sql`INSERT INTO sessions ${sql.insert(row)}`, failed);

  return id;
});

const lastSeq = (sql: Sql, session: SessionId) =>
  Effect.mapError(
    sql<{ readonly seq: number }>`
      SELECT COALESCE(MAX(seq), 0) AS seq FROM session_events WHERE session_id = ${session}
    `,
    failed,
  ).pipe(Effect.map(([last]) => last?.seq ?? 0));

/** Saves the events after the session's last seq, all or none. */
export const insert = Effect.fn("SessionStore.insert")(function* (
  sql: Sql,
  session: SessionId,
  events: Arr.NonEmptyReadonlyArray<NewEvent>,
) {
  const at = yield* DateTime.now;

  const write = Effect.gen(function* () {
    yield* requireSession(sql, session);
    const start = (yield* lastSeq(sql, session)) + 1;

    const saved = Arr.map(events, (event, index): SessionEvent => ({
      ...event,
      session,
      seq: start + index,
      at,
    }));

    const rows = yield* Effect.forEach(saved, ({ session: session_id, ...rest }) =>
      Effect.mapError(Schema.encodeEffect(Row)({ session_id, ...rest }), failed),
    );

    yield* Effect.mapError(sql`INSERT INTO session_events ${sql.insert(rows)}`, failed);

    return saved;
  });

  // The transaction takes the write lock first, so the seq it reads stays the last one.
  return yield* sql
    .withTransaction(write)
    .pipe(Effect.catchTag("SqlError", (error) => Effect.fail(failed(error))));
});

/** Every event after `seq`, oldest first. */
export const after = Effect.fn("SessionStore.after")(function* (
  sql: Sql,
  session: SessionId,
  seq: Seq,
) {
  yield* requireSession(sql, session);

  const rows = yield* Effect.mapError(
    sql`SELECT * FROM session_events WHERE session_id = ${session} AND seq > ${seq} ORDER BY seq`,
    failed,
  );

  return yield* decodeRows(rows);
});

/** The newest event of `kind` in any session. */
export const latest = Effect.fn("SessionStore.latest")(function* (sql: Sql, kind: string) {
  const rows = yield* Effect.mapError(
    sql`SELECT * FROM session_events WHERE kind = ${kind} ORDER BY at DESC, seq DESC LIMIT 1`,
    failed,
  );

  return Arr.head(yield* decodeRows(rows));
});

/** The latest `limit` events, or the `limit` before `seq`, oldest first. */
export const before = Effect.fn("SessionStore.before")(function* (
  sql: Sql,
  session: SessionId,
  seq: Seq | undefined,
  limit: number,
) {
  yield* requireSession(sql, session);

  const query =
    seq === undefined
      ? sql`
          SELECT * FROM session_events WHERE session_id = ${session}
          ORDER BY seq DESC LIMIT ${limit}
        `
      : sql`
          SELECT * FROM session_events WHERE session_id = ${session} AND seq < ${seq}
          ORDER BY seq DESC LIMIT ${limit}
        `;

  const rows = yield* Effect.mapError(query, failed);

  return (yield* decodeRows(rows)).toReversed();
});
