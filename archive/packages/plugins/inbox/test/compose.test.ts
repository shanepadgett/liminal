/** Tags in the input text, what tags and pictures add to a message, and stashes. */

import { describe, expect, test } from "bun:test";

import { Effect, FileSystem, Layer, Option } from "effect";

import type { Entry } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import {
  type TagAttachment,
  tagAt,
  tagPaths,
  TagImage,
  type TagSource,
  TagText,
  tagText,
} from "../src/contract.ts";
import { makeCompose } from "../src/server/compose.ts";
import { Stashes, stashesLayer } from "../src/server/stashes.ts";

describe("tags in text", () => {
  test("the tag at the cursor runs to the next space", () => {
    expect(tagAt("see @src/a.ts now", 8)).toEqual({ start: 4, end: 13, query: "src/a.ts" });
  });

  test("a quoted tag holds spaces", () => {
    expect(tagAt('read @"my notes.md" ok', 10)).toEqual({
      start: 5,
      end: 19,
      query: "my notes.md",
    });
  });

  test("an address holds no tag", () => {
    expect(tagAt("me@example.com", 5)).toBeUndefined();
  });

  test("tag paths are listed once each, in order", () => {
    expect(tagPaths('@a.ts and @"b c.md" and @a.ts but not x@y')).toEqual(["a.ts", "b c.md"]);
  });

  test("a path with spaces is quoted", () => {
    expect([tagText("a.ts"), tagText("b c.md")]).toEqual(["@a.ts", '@"b c.md"']);
  });
});

const png = new Uint8Array([137, 80, 78, 71]);

const known = new Map<string, TagAttachment>([
  ["listed/", TagText.make({ text: "a.ts" })],
  ["shot.png", TagImage.make({ data: png, mediaType: "image/png" })],
]);

/** The first knows `listed/` and `shot.png`; the second knows every tag but comes later. */
const sources: ReadonlyArray<TagSource> = [
  {
    find: () => Effect.succeed([]),
    attach: (tag) => Effect.succeed(Option.fromUndefinedOr(known.get(tag))),
  },
  {
    find: () => Effect.succeed([]),
    attach: () => Effect.succeedSome(TagText.make({ text: "second" })),
  },
];

const partsOf = (entry: { readonly model?: Entry["model"] | undefined }) =>
  (entry.model ?? []).flatMap((message) => message.parts);

effectTest(
  "a message holds its text, what its tags attach, then its pictures, saved once by content",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const folder = `${yield* fs.makeTempDirectoryScoped()}/pictures`;
    const compose = yield* makeCompose(Effect.succeed(sources), folder);
    const pictures = [{ data: png, mediaType: "image/png" as const }];

    const message = yield* compose({ text: "look @listed/ @shot.png [Image 1]", pictures });
    const parts = partsOf(message);

    expect(parts.map((part) => part.type)).toEqual(["text", "text", "image", "image"]);
    expect(parts[1]).toMatchObject({ text: "a.ts" });
    expect(parts[2]).toEqual(parts[3]);
    expect(message.data.images).toHaveLength(2);
    expect(yield* fs.readDirectory(folder)).toHaveLength(1);
  }),
  testBaseServices,
);

const stashes = Layer.unwrap(
  Effect.map(
    Effect.flatMap(FileSystem.FileSystem, (fs) => fs.makeTempDirectoryScoped()),
    (folder) => stashesLayer(`${folder}/stashes.db`),
  ),
).pipe(Layer.provideMerge(testBaseServices));

effectTest(
  "stashes are kept per folder, newest first, each text once",
  Effect.gen(function* () {
    const store = yield* Stashes;

    expect(yield* store.add("/a", "one")).toBe("stashed");
    expect(yield* store.add("/a", "two")).toBe("stashed");
    expect(yield* store.add("/a", "one")).toBe("duplicate");
    expect(yield* store.add("/b", "one")).toBe("stashed");

    const listed = yield* store.list("/a");
    expect(listed.map((stash) => stash.text)).toEqual(["two", "one"]);

    yield* store.remove(listed[0]?.id ?? 0);
    expect((yield* store.list("/a")).map((stash) => stash.text)).toEqual(["one"]);
  }),
  stashes,
);
