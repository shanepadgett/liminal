/** SQL for each SessionStore operation; each needs the SqlClient and fails with the store's errors. */

import { Array as Arr, Clock, Effect, Predicate, Schema } from "effect";
import { SqlClient, type SqlError } from "effect/sql";

import {
  type NewEntry,
  type SeqRange,
  SessionNotFound,
  StoredEntry,
  StoredLive,
  StoreError,
} from "../contract.ts";
import { indexSession } from "./session-index.ts";

const SessionRow = Schema.Struct({
  parentId: Schema.NullOr(Schema.String),
  forkSeq: Schema.NullOr(Schema.Int),
});

type SessionRow = typeof SessionRow.Type;

const LastSeqRow = Schema.Struct({ last: Schema.NullOr(Schema.Int) });

type DatabaseError = SqlError.SqlError | Schema.SchemaError;

/** Database and row-decoding failures become a StoreError naming the operation. */
export const storeFailure =
  (operation: string) =>
  <A, E, R>(effect: Effect.Effect<A, E | DatabaseError, R>) =>
    Effect.catchIf(
      effect,
      (error): error is DatabaseError =>
        Predicate.isTagged(error, "SqlError") || Predicate.isTagged(error, "SchemaError"),
      (cause) =>
        Effect.fail(
          new StoreError({
            message: Predicate.isTagged(cause, "SchemaError")
              ? `${operation} read a malformed row`
              : `${operation} failed`,
            cause,
          }),
        ),
    );

const findSession = Effect.fn("findSession")(function* (sessionId: string) {
  const sql = yield* SqlClient.SqlClient;

  const rows = yield* sql`
    SELECT parent_id AS "parentId", fork_seq AS "forkSeq" FROM sessions WHERE id = ${sessionId}
  `.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(SessionRow))));

  const [row] = rows;
  if (row === undefined) return yield* new SessionNotFound({ sessionId });

  return row;
});

export const createSession = Effect.fn("createSession")(function* (id: string) {
  const sql = yield* SqlClient.SqlClient;
  const now = yield* Clock.currentTimeMillis;

  yield* sql`INSERT INTO sessions (id, parent_id, fork_seq, created_at) VALUES (${id}, NULL, NULL, ${now})`;
  yield* indexSession(id, now, 0);
});

export const forkSession = Effect.fn("forkSession")(function* (
  id: string,
  parent: string,
  seq: number,
) {
  const sql = yield* SqlClient.SqlClient;
  const now = yield* Clock.currentTimeMillis;
  yield* findSession(parent);

  yield* sql`INSERT INTO sessions (id, parent_id, fork_seq, created_at) VALUES (${id}, ${parent}, ${seq}, ${now})`;
  yield* indexSession(id, now, seq);
});

/** One session's slice of a read: its entries with `seq <= through`. */
interface Link {
  readonly sessionId: string;
  readonly through: number;
}

/** The session and its fork ancestors, oldest first, each cut at the seq its child forked from. */
const forkChain = Effect.fn("forkChain")(function* (sessionId: string) {
  const links: Array<Link> = [];
  let current: string | null = sessionId;
  let through = Number.MAX_SAFE_INTEGER;

  while (current !== null) {
    const row: SessionRow = yield* findSession(current);
    links.unshift({ sessionId: current, through });
    through = row.forkSeq ?? 0;
    current = row.parentId;
  }

  return links;
});

export const readEntries = Effect.fn("readEntries")(function* (sessionId: string, range: SeqRange) {
  const sql = yield* SqlClient.SqlClient;
  const after = range.after ?? 0;
  const entries: Array<StoredEntry> = [];

  for (const link of yield* forkChain(sessionId)) {
    const through = Math.min(link.through, range.through ?? Number.MAX_SAFE_INTEGER);

    const rows = yield* sql`
      SELECT session_id AS "sessionId", seq, kind, at, data, model, text, user FROM entries
      WHERE session_id = ${link.sessionId} AND seq > ${after} AND seq <= ${through}
      ORDER BY seq
    `.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(StoredEntry))));

    entries.push(...rows);
  }

  return entries;
});

/** Runs inside the append's write transaction, so no other writer can take the same seq. */
const lastSeq = Effect.fn("lastSeq")(function* (sessionId: string) {
  const sql = yield* SqlClient.SqlClient;
  const session = yield* findSession(sessionId);

  const [row] =
    yield* sql`SELECT MAX(seq) AS last FROM entries WHERE session_id = ${sessionId}`.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(LastSeqRow))),
    );

  return Math.max(row?.last ?? 0, session.forkSeq ?? 0);
});

/** Must run in a write transaction; the SQLite client begins its transactions IMMEDIATE. */
export const appendEntries = Effect.fn("appendEntries")(function* (
  sessionId: string,
  entries: readonly [NewEntry, ...Array<NewEntry>],
) {
  const sql = yield* SqlClient.SqlClient;
  const last = yield* lastSeq(sessionId);

  const stored = Arr.map(entries, (entry, index): StoredEntry => ({
    ...entry,
    sessionId,
    seq: last + index + 1,
  }));

  const rows = stored.map((entry) => ({
    session_id: entry.sessionId,
    seq: entry.seq,
    kind: entry.kind,
    at: entry.at,
    data: entry.data,
    model: entry.model,
    text: entry.text,
    user: entry.user,
  }));

  yield* sql`INSERT INTO entries ${sql.insert(rows)}`;

  const newest = Arr.lastNonEmpty(stored);
  yield* indexSession(sessionId, newest.at, newest.seq);

  return stored;
});

export const readLive = Effect.fn("readLive")(function* (sessionId: string) {
  const sql = yield* SqlClient.SqlClient;
  yield* findSession(sessionId);

  const [live] = yield* sql`SELECT kind, data FROM live WHERE session_id = ${sessionId}`.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(StoredLive))),
  );

  return live;
});

export const writeLive = Effect.fn("writeLive")(function* (sessionId: string, live?: StoredLive) {
  const sql = yield* SqlClient.SqlClient;
  yield* findSession(sessionId);

  if (live === undefined) {
    yield* sql`DELETE FROM live WHERE session_id = ${sessionId}`;

    return;
  }

  yield* sql`
    INSERT INTO live (session_id, kind, data) VALUES (${sessionId}, ${live.kind}, ${live.data})
    ON CONFLICT (session_id) DO UPDATE SET kind = excluded.kind, data = excluded.data
  `;
});
