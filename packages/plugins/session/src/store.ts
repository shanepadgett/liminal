import { DateTime, Effect, Schema } from "effect";
/** Queries over the session tables. */
import * as Arr from "effect/Array";
import type { SqlClient } from "effect/sql";

import { Attributes } from "@shanepadgett/liminal-core";
import { Message } from "@shanepadgett/liminal-model/contract";

import {
  MessageEvent,
  type NewEvent,
  type Seq,
  type SessionEvent,
  SessionId,
  SessionNotFound,
  SessionStoreFailed,
  type SessionSummary,
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
  folder: string,
  attributes: Attributes,
) {
  const id = SessionId.make(crypto.randomUUID());
  const now = yield* DateTime.now;
  const encoded = yield* Effect.mapError(Schema.encodeEffect(AttributesText)(attributes), failed);
  const row = { id, created_at: now.epochMilliseconds, folder, attributes: encoded };

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

/** A session as the list query gives it: its latest event's time and its first user message. */
const SummaryRow = Schema.Struct({
  id: SessionId,
  updated_at: Schema.DateTimeUtcFromMillis,
  first_message: Schema.fromJsonString(Message),
});

/** The first line of the message's first text, trimmed. */
const titleOf = (message: Message) => {
  const text = message.parts.find((part) => part.type === "text")?.text ?? "";

  return text.trim().split("\n")[0] ?? "";
};

const toSummary = (row: typeof SummaryRow.Type): SessionSummary => ({
  id: row.id,
  title: titleOf(row.first_message),
  updatedAt: row.updated_at,
});

/** The latest `limit` sessions in `folder` that have a user message, latest first. */
export const list = Effect.fn("SessionStore.list")(function* (
  sql: Sql,
  folder: string,
  limit: number,
) {
  const rows = yield* Effect.mapError(
    sql`
      SELECT s.id AS id, MAX(e.at) AS updated_at, (
        SELECT u.data FROM session_events u
        WHERE u.session_id = s.id AND u.kind = ${MessageEvent.kind}
          AND json_extract(u.data, '$.role') = 'user'
        ORDER BY u.seq LIMIT 1
      ) AS first_message
      FROM sessions s JOIN session_events e ON e.session_id = s.id
      WHERE s.folder = ${folder}
      GROUP BY s.id
      HAVING first_message IS NOT NULL
      ORDER BY updated_at DESC LIMIT ${limit}
    `,
    failed,
  );

  return yield* Effect.forEach(rows, (row) =>
    Effect.map(Effect.mapError(Schema.decodeUnknownEffect(SummaryRow)(row), failed), toSummary),
  );
});
