/** Audits stored entry data against current definitions without migrating or resuming sessions. */

import { Database } from "bun:sqlite";

import { Effect, Schema, SchemaIssue } from "effect";

import type { EntryDefinition } from "@liminal/sdk";

const AuditRow = Schema.Struct({
  sessionId: Schema.String,
  seq: Schema.Int,
  kind: Schema.String,
  data: Schema.String,
});

type AuditRow = typeof AuditRow.Type;

export class HistoryUnreadable extends Schema.TaggedError<
  HistoryUnreadable,
  { readonly brand: unique symbol }
>()("HistoryUnreadable", { message: Schema.String }) {}

export interface HistoryMismatch {
  readonly sessionId: string;
  readonly seq: number;
  readonly kind: string;
  readonly paths: ReadonlyArray<string>;
}

export interface UnknownKind {
  readonly kind: string;
  readonly entries: number;
  readonly sessions: ReadonlyArray<string>;
}

export interface HistoryAudit {
  readonly entries: number;
  readonly sessions: number;
  readonly mismatches: ReadonlyArray<HistoryMismatch>;
  readonly unknownKinds: ReadonlyArray<UnknownKind>;
}

/** Only paths are reported; schema messages can contain saved prompts, commands or credentials. */
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1({
  leafHook: () => "Invalid entry data",
  checkHook: () => "Invalid entry data",
});

const readRows = Effect.fn("HistoryAudit.readRows")(function* (filename: string) {
  const rows = yield* Effect.try({
    try: () => {
      using database = new Database(filename, { readonly: true, strict: true });

      return database
        .query(
          "SELECT session_id AS sessionId, seq, kind, data FROM entries ORDER BY session_id, seq",
        )
        .all();
    },
    catch: () =>
      new HistoryUnreadable({
        message: `Cannot read session entries from ${filename}; check the path, permissions and database schema.`,
      }),
  });

  return yield* Schema.decodeUnknownEffect(Schema.Array(AuditRow))(rows).pipe(
    Effect.mapError(
      () =>
        new HistoryUnreadable({
          message: `The entry identifiers in ${filename} are malformed; inspect the database before retrying.`,
        }),
    ),
  );
});

const checkEntry = Effect.fn("HistoryAudit.checkEntry")(function* (
  row: AuditRow,
  definition: EntryDefinition,
) {
  return yield* Schema.decodeEffect(Schema.fromJsonString(definition.data))(row.data).pipe(
    Effect.match({
      onSuccess: (): ReadonlyArray<HistoryMismatch> => [],
      onFailure: (error): ReadonlyArray<HistoryMismatch> => [
        {
          sessionId: row.sessionId,
          seq: row.seq,
          kind: row.kind,
          paths: formatIssue(error.issue).issues.map((issue) =>
            issue.path === undefined || issue.path.length === 0 ? "$" : JSON.stringify(issue.path),
          ),
        },
      ],
    }),
  );
});

/** Opens only the supplied database in read-only mode; unknown kinds are not schema mismatches. */
export const auditHistory = Effect.fn("HistoryAudit.auditHistory")(function* (
  filename: string,
  definitions: ReadonlyMap<string, EntryDefinition>,
) {
  const rows = yield* readRows(filename);
  const mismatches: HistoryMismatch[] = [];
  const unknown = new Map<string, { entries: number; sessions: Set<string> }>();

  for (const row of rows) {
    const definition = definitions.get(row.kind);

    if (definition === undefined) {
      const group = unknown.get(row.kind) ?? { entries: 0, sessions: new Set<string>() };

      unknown.set(row.kind, {
        entries: group.entries + 1,
        sessions: new Set([...group.sessions, row.sessionId]),
      });

      continue;
    }

    mismatches.push(...(yield* checkEntry(row, definition)));
  }

  const report: HistoryAudit = {
    entries: rows.length,
    sessions: new Set(rows.map((row) => row.sessionId)).size,
    mismatches,
    unknownKinds: [...unknown].map(([kind, group]) => ({
      kind,
      entries: group.entries,
      sessions: [...group.sessions],
    })),
  };

  return report;
});

/** Summarizes identities and failing paths without printing stored data or schema messages. */
export const formatHistoryAudit = (report: HistoryAudit): string => {
  const affected = new Set(report.mismatches.map((row) => row.sessionId)).size;
  const summary = `Audited ${report.entries} entries in ${report.sessions} sessions: ${report.mismatches.length} mismatches in ${affected} sessions; ${report.unknownKinds.length} unknown kinds.`;

  const mismatches = report.mismatches.map(
    (row) =>
      `Mismatch: session ${JSON.stringify(row.sessionId)}, entry ${row.seq}, kind ${JSON.stringify(row.kind)}, paths ${row.paths.join(", ")}`,
  );

  const unknown = report.unknownKinds.map(
    (group) =>
      `Unknown kind ${JSON.stringify(group.kind)}: ${group.entries} entries in sessions ${group.sessions.map((session) => JSON.stringify(session)).join(", ")}`,
  );

  return [summary, ...mismatches, ...unknown].join("\n");
};
