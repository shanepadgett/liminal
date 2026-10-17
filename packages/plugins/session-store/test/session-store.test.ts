import { expect } from "bun:test";

import { Context, Effect, Layer } from "effect";

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
    yield* first.createSession("s1");

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
