/**
 * Stashes: drafts the user sets aside, one list per workspace folder, in the `stashes` table. The
 * `tui` entry stashes the chat draft with `ctrl+s` and brings one back with `/pop`.
 */
import { Clock, Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";

import { Stash, StashesFailed, StashRpc } from "./contract.ts";
import { migrate } from "./migrations.ts";

/** The `marks` column holds a JSON array. */
const MarksColumn = Schema.fromJsonString(Schema.Array(Schema.String));

const decodeStashes = Schema.decodeUnknownEffect(
  Schema.Array(Schema.Struct({ ...Stash.fields, marks: MarksColumn })),
);

const encodeMarks = Schema.encodeEffect(MarksColumn);

const failed = (error: { readonly message: string }) =>
  new StashesFailed({ message: `Stashes: ${error.message}` });

const rpc = StashRpc.toLayer(
  Effect.gen(function* () {
    yield* migrate;
    const sql = yield* SqlClient.SqlClient;
    const { workspace } = yield* Directories;

    return StashRpc.of({
      "stash/save": ({ text, marks }) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const encoded = yield* encodeMarks(marks);

          yield* sql`
            INSERT INTO stashes (folder, text, marks, created_at)
            VALUES (${workspace}, ${text}, ${encoded}, ${now})
            ON CONFLICT (folder, text) DO NOTHING
          `;
        }).pipe(Effect.mapError(failed)),
      "stash/list": () =>
        sql`
          SELECT id, text, marks, created_at AS createdAt FROM stashes
          WHERE folder = ${workspace} ORDER BY id DESC
        `.pipe(Effect.flatMap(decodeStashes), Effect.mapError(failed)),
      "stash/drop": ({ id }) =>
        sql`DELETE FROM stashes WHERE id = ${id}`.pipe(Effect.asVoid, Effect.mapError(failed)),
    });
  }),
);

export default definePlugin({
  name: "stash",
  provides: [],
  requires: [Directories, SqlClient.SqlClient],
  layer: rpc,
  entries: { tui: () => import("./tui/index.tsx") },
});
