/** The opt-in history audit reads real SQLite data without booting plugins or changing history. */

import { Database } from "bun:sqlite";
import { expect } from "bun:test";

import { Effect, FileSystem, Path, Schema } from "effect";

import { defineEntry, Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { loadEntryDefinitions } from "../src/audit/definitions.ts";
import { auditHistory, formatHistoryAudit } from "../src/audit/history.ts";

const Note = defineEntry({
  kind: "audit/note",
  data: Schema.Struct({ text: Schema.String, count: Schema.Int }),
  model: false,
  user: "debug",
});

const definitions = new Map([[Note.kind, Note]]);

const databasePath = Effect.gen(function* () {
  const path = yield* Path.Path;
  const { data } = yield* Directories;

  return path.join(data, "audit.db");
});

interface FixtureEntry {
  readonly session: string;
  readonly seq: number;
  readonly kind: string;
  readonly data: string;
}

const createHistory = Effect.fn("createHistory")(function* (
  filename: string,
  entries: ReadonlyArray<FixtureEntry>,
) {
  yield* Effect.sync(() => {
    using database = new Database(filename);

    database.run(
      "CREATE TABLE entries (session_id TEXT, seq INTEGER, kind TEXT, data TEXT, PRIMARY KEY (session_id, seq))",
    );

    database.run("CREATE TABLE live (session_id TEXT, kind TEXT, data TEXT)");
    database.run("INSERT INTO live VALUES ('unfinished', 'agent-loop/reply', '{}')");
    const insert = database.query("INSERT INTO entries VALUES (?, ?, ?, ?)");
    for (const entry of entries) insert.run(entry.session, entry.seq, entry.kind, entry.data);
  });
});

effectTest(
  "the audit identifies mismatching entries and unknown kinds without exposing values or changing the database",
  Effect.gen(function* () {
    const filename = yield* databasePath;
    const fs = yield* FileSystem.FileSystem;

    yield* createHistory(filename, [
      { session: "good", seq: 1, kind: Note.kind, data: '{"text":"private prompt","count":1}' },
      {
        session: "bad",
        seq: 1,
        kind: Note.kind,
        data: '{"text":"private prompt","count":"secret-token"}',
      },
      { session: "bad", seq: 2, kind: Note.kind, data: '{"text":"private prompt"}' },
      { session: "bad", seq: 3, kind: Note.kind, data: "invalid JSON with secret-token" },
      { session: "unknown", seq: 1, kind: "removed/entry", data: '{"secret":"secret-token"}' },
      { session: "unknown", seq: 2, kind: "removed/entry", data: "{}" },
    ]);

    const before = yield* fs.readFile(filename);
    const report = yield* auditHistory(filename, definitions);

    expect(report.entries).toBe(6);
    expect(report.sessions).toBe(3);
    expect(report.mismatches.map((row) => row.seq)).toEqual([1, 2, 3]);
    expect(report.mismatches[0]?.paths).toContain('["count"]');

    expect(report.unknownKinds).toEqual([
      { kind: "removed/entry", entries: 2, sessions: ["unknown"] },
    ]);

    const output = formatHistoryAudit(report);
    expect(output).toContain('session "bad", entry 1');
    expect(output).not.toContain("private prompt");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("invalid JSON");
    expect(yield* fs.readFile(filename)).toEqual(before);
  }),
  testBaseServices,
);

effectTest(
  "a missing audit database is not created",
  Effect.gen(function* () {
    const filename = yield* databasePath;
    const fs = yield* FileSystem.FileSystem;
    const error = yield* Effect.flip(auditHistory(filename, definitions));

    expect(error.message).toContain("Cannot read session entries");
    expect(yield* fs.exists(filename)).toBe(false);
  }),
  testBaseServices,
);

effectTest(
  "an empty history has no mismatches",
  Effect.gen(function* () {
    const filename = yield* databasePath;
    yield* createHistory(filename, []);

    expect(yield* auditHistory(filename, definitions)).toEqual({
      entries: 0,
      sessions: 0,
      mismatches: [],
      unknownKinds: [],
    });
  }),
  testBaseServices,
);

effectTest(
  "built-in entry definitions load from contracts without starting their servers",
  Effect.gen(function* () {
    const found = yield* loadEntryDefinitions;
    const fs = yield* FileSystem.FileSystem;
    const { data } = yield* Directories;

    expect(found.has("session-log/user")).toBe(true);
    expect(found.has("approval/answer")).toBe(true);
    expect(found.has("memory/checkpoint")).toBe(true);
    expect(yield* fs.readDirectory(data)).toEqual([]);
  }),
  testBaseServices,
);
