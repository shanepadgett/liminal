/** The session index: one row per session, kept current by writes and rebuilt from the log. */

import { Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { StoredSession } from "../contract.ts";

/** Raise when the index's columns or their meaning change; the index then rebuilds on open. */
const indexVersion = "1";

const VersionRow = Schema.Struct({ value: Schema.String });

const rebuild = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`DELETE FROM session_index`;

  yield* sql`
    INSERT INTO session_index (session_id, updated_at, last_seq)
    SELECT s.id,
      COALESCE((SELECT MAX(e.at) FROM entries e WHERE e.session_id = s.id), s.created_at),
      MAX(COALESCE((SELECT MAX(e.seq) FROM entries e WHERE e.session_id = s.id), 0), COALESCE(s.fork_seq, 0))
    FROM sessions s
  `;

  yield* sql`
    INSERT INTO meta (key, value) VALUES ('index_version', ${indexVersion})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
});

/** Rebuilds the index from the log when it was built by another index version, or never. */
export const ensureIndex = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const [row] = yield* sql`SELECT value FROM meta WHERE key = 'index_version'`.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(VersionRow))),
  );

  if (row?.value !== indexVersion) yield* sql.withTransaction(rebuild);
});

/** Records a session's newest state; runs inside the write that changed it. */
export const indexSession = Effect.fn("indexSession")(function* (
  sessionId: string,
  updatedAt: number,
  lastSeq: number,
) {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    INSERT INTO session_index (session_id, updated_at, last_seq) VALUES (${sessionId}, ${updatedAt}, ${lastSeq})
    ON CONFLICT (session_id) DO UPDATE SET updated_at = excluded.updated_at, last_seq = excluded.last_seq
  `;
});

export const listSessions = Effect.fn("listSessions")(function* (workspace: string) {
  const sql = yield* SqlClient.SqlClient;

  return yield* sql`
    SELECT s.id, s.parent_id AS "parentId", s.workspace, s.title, s.name, s.created_at AS "createdAt",
      i.updated_at AS "updatedAt", i.last_seq AS "lastSeq"
    FROM sessions s JOIN session_index i ON i.session_id = s.id
    WHERE s.workspace = ${workspace}
    ORDER BY i.updated_at DESC, s.id
  `.pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(StoredSession))));
});
