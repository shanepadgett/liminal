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

const decodeStashes = Schema.decodeUnknownEffect(Schema.Array(Stash));

const failed = (error: { readonly message: string }) =>
  new StashesFailed({ message: `Stashes: ${error.message}` });

const rpc = StashRpc.toLayer(
  Effect.gen(function* () {
    yield* migrate;
    const sql = yield* SqlClient.SqlClient;
    const { workspace } = yield* Directories;

    return StashRpc.of({
      "stash/save": ({ text }) =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap(
            (now) => sql`
              INSERT INTO stashes (folder, text, created_at) VALUES (${workspace}, ${text}, ${now})
              ON CONFLICT (folder, text) DO NOTHING
            `,
          ),
          Effect.asVoid,
          Effect.mapError(failed),
        ),
      "stash/list": () =>
        sql`
          SELECT id, text, created_at AS createdAt FROM stashes
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
