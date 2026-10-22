/**
 * The chat screen, drawn by the `tui` entry, and the stashes it keeps: one list of set-aside drafts
 * per workspace folder, in the `stashes` table.
 */
import { Clock, Effect, Schema } from "effect";
import { SqlClient } from "effect/sql";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";

import { ChatRpc, Stash, StashesFailed } from "./contract.ts";
import { migrate } from "./migrations.ts";

const decodeStashes = Schema.decodeUnknownEffect(Schema.Array(Stash));

const failed = (error: { readonly message: string }) =>
  new StashesFailed({ message: `Stashes: ${error.message}` });

const rpc = ChatRpc.toLayer(
  Effect.gen(function* () {
    yield* migrate;
    const sql = yield* SqlClient.SqlClient;
    const { workspace } = yield* Directories;

    return ChatRpc.of({
      "chat/stash": ({ text }) =>
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
      "chat/stashes": () =>
        sql`
          SELECT id, text, created_at AS createdAt FROM stashes
          WHERE folder = ${workspace} ORDER BY id DESC
        `.pipe(Effect.flatMap(decodeStashes), Effect.mapError(failed)),
      "chat/unstash": ({ id }) =>
        sql`DELETE FROM stashes WHERE id = ${id}`.pipe(Effect.asVoid, Effect.mapError(failed)),
    });
  }),
);

export default definePlugin({
  name: "chat",
  provides: [],
  requires: [Directories, SqlClient.SqlClient],
  layer: rpc,
  entries: { tui: () => import("./tui/index.tsx") },
});
