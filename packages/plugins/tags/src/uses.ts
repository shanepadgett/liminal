/**
 * How often and how lately each workspace sent each tag, so the `@` list puts those first. A tag
 * scores its uses over one plus the days since its last use, as OpenCode's frecency does. The
 * counts only order a list, so a failure is logged and never fails a send.
 */
import { Clock, Effect, Schema } from "effect";
import type { SqlClient } from "effect/sql";

type Sql = SqlClient.SqlClient;

const DAY_MILLIS = 24 * 60 * 60 * 1000;

const UseRow = Schema.Struct({ tag: Schema.String, uses: Schema.Int, last_used: Schema.Int });

/** Counts one more use of each of `tags` in `folder`. */
export const record = Effect.fn("TagUses.record")(
  function* (sql: Sql, folder: string, tags: ReadonlyArray<string>) {
    const now = yield* Clock.currentTimeMillis;

    yield* Effect.forEach(
      tags,
      (tag) => sql`
        INSERT INTO tag_uses (folder, tag, uses, last_used) VALUES (${folder}, ${tag}, 1, ${now})
        ON CONFLICT (folder, tag) DO UPDATE SET uses = uses + 1, last_used = ${now}
      `,
      { discard: true },
    );
  },
  Effect.catchCause((cause) => Effect.logWarning("Tag uses were not saved.", cause)),
);

/** Each tag sent in `folder`, by its score; empty when the table cannot be read. */
export const scores = Effect.fn("TagUses.scores")(
  function* (sql: Sql, folder: string) {
    const now = yield* Clock.currentTimeMillis;
    const rows = yield* sql`SELECT tag, uses, last_used FROM tag_uses WHERE folder = ${folder}`;
    const decoded = yield* Schema.decodeUnknownEffect(Schema.Array(UseRow))(rows);

    return new Map(
      decoded.map((row) => [row.tag, row.uses / (1 + (now - row.last_used) / DAY_MILLIS)]),
    );
  },
  Effect.catchCause((cause) =>
    Effect.as(Effect.logWarning("Tag uses could not be read.", cause), new Map<string, number>()),
  ),
);
