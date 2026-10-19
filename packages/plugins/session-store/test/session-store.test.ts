import { expect } from "bun:test";

import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Context, Effect, Layer, Path } from "effect";
import { SqlClient } from "effect/sql";

import { Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { type NewEntry, SessionStore } from "../src/contract.ts";
import { layer } from "../src/server.ts";
import { sessionStoreConformance } from "./conformance.ts";

/** Both layers open sessions.db in the same test data folder, so `reopen` sees what `layer` saved. */
sessionStoreConformance("sqlite", () => ({ layer, reopen: layer }));

const note: NewEntry = {
  kind: "test/note",
  at: 0,
  data: "{}",
  model: null,
  text: "note",
  user: "shown",
};

// Two builds of the store share one file while a graph change hands over from the old build.
effectTest(
  "two stores over one file never take the same seq",
  Effect.gen(function* () {
    const first = Context.get(yield* Layer.build(layer), SessionStore);
    const second = Context.get(yield* Layer.build(layer), SessionStore);
    yield* first.createSession("s1", "/work");

    yield* Effect.all(
      [
        first.appendEntries("s1", [note, note]),
        second.appendEntries("s1", [note, note]),
        first.appendEntries("s1", [note]),
        second.appendEntries("s1", [note]),
      ],
      { concurrency: "unbounded" },
    );

    const saved = yield* second.readEntries("s1", {});
    expect(saved.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5, 6]);
  }),
  testBaseServices,
);

effectTest(
  "the index rebuilds from the log when its version changes",
  Effect.gen(function* () {
    const store = Context.get(yield* Layer.build(layer), SessionStore);
    yield* store.createSession("s1", "/work");
    yield* store.appendEntries("s1", [{ ...note, at: 5000 }]);

    const directories = yield* Directories;
    const path = yield* Path.Path;
    const filename = path.join(directories.data, "sessions.db");

    yield* Effect.scoped(
      Effect.gen(function* () {
        const sql = Context.get(
          yield* Layer.build(SqliteClient.layer({ filename })),
          SqlClient.SqlClient,
        );

        yield* sql`DELETE FROM session_index`;
        yield* sql`UPDATE meta SET value = 'old' WHERE key = 'index_version'`;
      }),
    );

    const reopened = Context.get(yield* Layer.build(layer), SessionStore);

    expect(yield* reopened.listSessions("/work")).toEqual([
      {
        id: "s1",
        parentId: null,
        workspace: "/work",
        title: "",
        createdAt: 0,
        updatedAt: 5000,
        lastSeq: 1,
      },
    ]);
  }),
  testBaseServices,
);
