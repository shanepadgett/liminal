/**
 * `@` tags: the workspace's files and folders as the first tag source, the list screens show, and
 * the `loop/Send` step that adds each tagged file's text to the message that tags it. The `tui`
 * entry adds the `@` draft trigger.
 */
import { Effect, FileSystem, Layer, Option, Path } from "effect";
import { ChildProcessSpawner } from "effect/process";
import { SqlClient } from "effect/sql";

import { Attribute, definePlugin, Registry } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { Added, addedOf, type Input, Send } from "@shanepadgett/liminal-loop/contract";
import type { Message } from "@shanepadgett/liminal-model/contract";
import { MessageEvent } from "@shanepadgett/liminal-session/contract";

import { type TagSource, TagSources, TagsRpc, tagsIn } from "./contract.ts";
import { migrate } from "./migrations.ts";
import * as Uses from "./uses.ts";
import { workspaceSource } from "./workspace.ts";

/** The text the first source that knows `tag` attaches; none when no source does. */
const attachFirst = (
  sources: ReadonlyArray<TagSource>,
  tag: string,
): Effect.Effect<Option.Option<string>> => {
  const [source, ...rest] = sources;
  if (source === undefined) return Effect.succeedNone;

  return Effect.filterOrElse(source.attach(tag), Option.isSome, () => attachFirst(rest, tag));
};

const textOf = (message: Message) =>
  message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");

/** A user message's input with one text part added per tag a source knows; any other unchanged. */
const makeWithTags = Effect.gen(function* () {
  const registry = yield* TagSources;
  const sql = yield* SqlClient.SqlClient;
  const { workspace } = yield* Directories;

  return Effect.fn("tags.withTags")(function* (input: Input) {
    const sources = yield* registry.list;
    const message = Option.flatten(yield* Effect.option(MessageEvent.decode(input)));
    if (Option.isNone(message) || message.value.role !== "user") return input;

    const found = yield* Effect.forEach(tagsIn(textOf(message.value)), (tag) =>
      Effect.map(
        attachFirst(sources, tag),
        Option.map((text) => ({ tag, text })),
      ),
    );

    const attached = found.flatMap(Option.toArray);
    if (attached.length === 0) return input;

    yield* Uses.record(
      sql,
      workspace,
      attached.map(({ tag }) => tag),
    );

    const added = addedOf(input.attributes) + attached.length;
    const attributes = yield* Attribute.set(input.attributes, Added, added);
    const parts = attached.map(({ text }) => ({ type: "text" as const, text }));

    return yield* MessageEvent.make(
      { ...message.value, parts: [...message.value.parts, ...parts] },
      attributes,
    );
  });
});

const steps = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* migrate;
    const sources = yield* TagSources;
    yield* sources.add(yield* workspaceSource);

    const withTags = yield* makeWithTags;

    yield* (yield* Send).wrap((request, next) =>
      Effect.flatMap(withTags(request.input), (input) => next({ ...request, input })),
    );
  }),
);

const rpc = TagsRpc.toLayer(
  Effect.gen(function* () {
    const sources = yield* TagSources;
    const sql = yield* SqlClient.SqlClient;
    const { workspace } = yield* Directories;

    return TagsRpc.of({
      "tags/list": () =>
        Effect.gen(function* () {
          const scores = yield* Uses.scores(sql, workspace);

          const rows = yield* Effect.flatMap(sources.list, (all) =>
            Effect.forEach(all, (source) => source.rows),
          );

          return rows
            .flat()
            .map(({ kind, tag }) => ({ kind, tag, frecency: scores.get(tag) ?? 0 }));
        }),
    });
  }),
);

export default definePlugin({
  name: "tags",
  provides: [TagSources],
  requires: [
    Send,
    Directories,
    SqlClient.SqlClient,
    ChildProcessSpawner.ChildProcessSpawner,
    FileSystem.FileSystem,
    Path.Path,
  ],
  layer: Layer.mergeAll(steps, rpc).pipe(
    Layer.provideMerge(Layer.effect(TagSources, Registry.make<TagSource>())),
  ),
  entries: { tui: () => import("./tui/index.tsx") },
});
