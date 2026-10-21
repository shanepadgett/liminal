/**
 * `memories.db`: each session's short-term notes and long-term memories, beside the log. Each note
 * or memory is one insert, so an interrupted writer leaves nothing half-written.
 */

import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { Seq, SessionId, whileLocked } from "@liminal/sdk";

import { MemoryFile } from "../contract.ts";

/** A file list as `memories.db` stores it: JSON text. */
const FilesJson = Schema.fromJsonString(Schema.Array(MemoryFile));

/** A summary of entries `from` through `through`. */
export const Note = Schema.Struct({
  number: Schema.Int,
  session: SessionId,
  from: Seq,
  through: Seq,
  text: Schema.String,
  tokens: Schema.Int,
  /** The files the entries touched or named, labeled. */
  files: FilesJson,
});

export type Note = typeof Note.Type;

/** A condensed summary of every note through `throughNote`, which ends at entry `throughSeq`. */
export const Memory = Schema.Struct({
  number: Schema.Int,
  session: SessionId,
  throughNote: Schema.Int,
  throughSeq: Seq,
  text: Schema.String,
  tokens: Schema.Int,
  /** Every condensed note's files merged, the newest label winning. */
  files: FilesJson,
});

export type Memory = typeof Memory.Type;

/** The notes after `memory`, oldest first: the ones it does not hold. */
export const unfoldedNotes = (
  notes: ReadonlyArray<Note>,
  memory: Option.Option<Memory>,
): ReadonlyArray<Note> =>
  Option.match(memory, {
    onNone: () => notes,
    onSome: ({ throughNote }) => notes.filter((note) => note.number > throughNote),
  });

/** `memories.db` could not be read or written. */
export class MemoriesError extends Schema.TaggedError<
  MemoriesError,
  { readonly brand: unique symbol }
>()("MemoriesError", { message: Schema.String }) {}

export class Memories extends Context.Service<
  Memories,
  {
    /** The session's notes, oldest first. */
    readonly notes: (session: SessionId) => Effect.Effect<ReadonlyArray<Note>, MemoriesError>;
    /** The session's memories, oldest first. */
    readonly memories: (session: SessionId) => Effect.Effect<ReadonlyArray<Memory>, MemoriesError>;
    readonly addNote: (note: Omit<Note, "number">) => Effect.Effect<Note, MemoriesError>;
    readonly addMemory: (memory: Omit<Memory, "number">) => Effect.Effect<Memory, MemoriesError>;
  }
>()("liminal/memory/Memories") {}

const createTables = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE notes (
      number INTEGER PRIMARY KEY,
      session TEXT NOT NULL,
      from_seq INTEGER NOT NULL,
      through_seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      tokens INTEGER NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE memories (
      number INTEGER PRIMARY KEY,
      session TEXT NOT NULL,
      through_note INTEGER NOT NULL,
      through_seq INTEGER NOT NULL,
      text TEXT NOT NULL,
      tokens INTEGER NOT NULL
    )
  `;

  yield* sql`CREATE INDEX notes_by_session ON notes (session, number)`;
  yield* sql`CREATE INDEX memories_by_session ON memories (session, number)`;
});

const addFiles = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE notes ADD COLUMN files TEXT NOT NULL DEFAULT '[]'`;
  yield* sql`ALTER TABLE memories ADD COLUMN files TEXT NOT NULL DEFAULT '[]'`;
});

const migrate = SqliteMigrator.run({
  loader: SqliteMigrator.fromRecord({ "0001_create_tables": createTables, "0002_files": addFiles }),
});

const encodeFiles = (files: ReadonlyArray<MemoryFile>) => JSON.stringify(files);

const decodeNotes = Schema.decodeUnknownEffect(Schema.Array(Note));
const decodeMemories = Schema.decodeUnknownEffect(Schema.Array(Memory));

const decodeInserted = Schema.decodeUnknownEffect(
  Schema.Tuple([Schema.Struct({ number: Schema.Int })]),
);

/** The number an `INSERT ... RETURNING number` gave the new row. */
const numberOf = <A, E>(insert: Effect.Effect<A, E>) =>
  Effect.map(Effect.flatMap(insert, decodeInserted), ([row]) => row.number);

const failed = (error: { readonly message: string }) =>
  new MemoriesError({ message: `memories.db: ${error.message}` });

/** Runs a query, waiting out locks, with any failure as a MemoriesError. */
const query = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E>) =>
  effect.pipe(whileLocked, Effect.mapError(failed));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* whileLocked(migrate);

  return Memories.of({
    notes: (session) =>
      query(
        Effect.flatMap(
          sql`
            SELECT number, session, from_seq AS "from", through_seq AS through, text, tokens,
              files
            FROM notes WHERE session = ${session} ORDER BY number
          `,
          decodeNotes,
        ),
      ),
    memories: (session) =>
      query(
        Effect.flatMap(
          sql`
            SELECT number, session, through_note AS throughNote, through_seq AS throughSeq, text,
              tokens, files
            FROM memories WHERE session = ${session} ORDER BY number
          `,
          decodeMemories,
        ),
      ),
    addNote: (note) =>
      query(
        Effect.map(
          numberOf(sql`
            INSERT INTO notes (session, from_seq, through_seq, text, tokens, files)
            VALUES (${note.session}, ${note.from}, ${note.through}, ${note.text}, ${note.tokens},
              ${encodeFiles(note.files)})
            RETURNING number
          `),
          (number) => ({ ...note, number }),
        ),
      ),
    addMemory: (memory) =>
      query(
        Effect.map(
          numberOf(sql`
            INSERT INTO memories (session, through_note, through_seq, text, tokens, files)
            VALUES (${memory.session}, ${memory.throughNote}, ${memory.throughSeq}, ${memory.text},
              ${memory.tokens}, ${encodeFiles(memory.files)})
            RETURNING number
          `),
          (number) => ({ ...memory, number }),
        ),
      ),
  });
});

/** The store over the database at `filename`, migrated before first use. */
export const memoriesLayer = (filename: string) =>
  Layer.effect(Memories, make).pipe(
    Layer.provide(SqliteClient.layer({ filename, busyTimeout: 0 })),
  );
