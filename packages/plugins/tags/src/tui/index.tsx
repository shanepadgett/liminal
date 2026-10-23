/**
 * Tags' `tui` entry: the `@` draft trigger. Its menu lists the workspace's tags, loaded each time
 * it opens; enter puts the tag in the draft, and on a folder tab opens it to list what is inside.
 */
import { Effect, Layer } from "effect";

import { DraftTriggers, type OpenTrigger, replaceToken } from "@shanepadgett/liminal-chat/tui";
import { Host } from "@shanepadgett/liminal-client";
import { definePlugin } from "@shanepadgett/liminal-core";
import { Colors } from "@shanepadgett/liminal-tui";

import { TagsRpc } from "../contract.ts";
import { writeTag } from "./marks.ts";
import { rank } from "./rank.ts";

/** The workspace's tags. */
const listTags = Effect.gen(function* () {
  const tags = yield* (yield* Host).client(TagsRpc);

  return yield* tags["tags/list"]();
}).pipe(Effect.scoped);

const make = Effect.gen(function* () {
  const host = yield* Host;
  const colors = yield* Colors;
  const triggers = yield* DraftTriggers;

  const open = Effect.gen(function* () {
    const listed = yield* Effect.provideService(listTags, Host, host);
    const kinds = new Map(listed.map((each) => [each.tag, each.kind]));

    const opened: OpenTrigger = {
      rows: (query) =>
        rank(listed, query).map(({ row, matches }) => ({
          id: row.tag,
          label: `@${row.tag}`,
          matches: matches.map((at) => at + 1),
        })),
      empty: "No files match",
      keys: [
        {
          key: "return",
          label: "tag",
          run: (row, draft, token) => {
            writeTag(draft, token, row.id, colors.syntax());
          },
        },
        {
          key: "tab",
          label: "open folder",
          enabled: (row) => kinds.get(row.id) === "folder",
          run: (row, draft, token) => {
            replaceToken(draft, token, `@${row.id}`);
          },
        },
      ],
    };

    return opened;
  });

  yield* triggers.add({ char: "@", where: "any-word", open });
});

export default definePlugin({
  name: "tags-tui",
  provides: [],
  requires: [Host, Colors, DraftTriggers],
  layer: Layer.effectDiscard(make),
});
