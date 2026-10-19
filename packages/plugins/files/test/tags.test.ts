/** The workspace's `@` tags: what git keeps, closest first, and what each kind of tag attaches. */

import { expect, test } from "bun:test";

import { Effect, FileSystem, Option, Path, Predicate } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { Directories } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { makeFileTags, ranked } from "../src/server/tags.ts";

test("closer matches come first, then shorter paths", () => {
  expect(ranked(["src/server/tags.ts", "tags.ts", "test/a.ts"], "tags")).toEqual([
    "tags.ts",
    "src/server/tags.ts",
  ]);
});

/** A git workspace holding `src/a.ts`, `shot.png` and an ignored `out/`. */
const workspace = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = (yield* Directories).workspace;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  yield* fs.makeDirectory(path.join(root, "src"), { recursive: true });
  yield* fs.makeDirectory(path.join(root, "out"));
  yield* fs.writeFileString(path.join(root, "src/a.ts"), "");
  yield* fs.writeFileString(path.join(root, "out/b.js"), "");
  yield* fs.writeFileString(path.join(root, ".gitignore"), "out/\n");
  yield* fs.writeFile(path.join(root, "shot.png"), new Uint8Array([1, 2, 3]));
  yield* spawner.string(ChildProcess.make("git", ["init", "-q"], { cwd: root }));
});

effectTest(
  "the list holds what git keeps, folders included",
  Effect.gen(function* () {
    yield* workspace;
    const tags = yield* makeFileTags;

    const rows = yield* tags.find("");
    const paths = rows.map((row) => row.path);
    expect(paths).toContain("src/");
    expect(paths).toContain("src/a.ts");
    expect(paths.some((found) => found.startsWith("out"))).toBe(false);
    expect(rows.find((row) => row.path === "shot.png")).toMatchObject({ kind: "image" });
  }),
  testBaseServices,
);

effectTest(
  "a folder attaches its listing, a picture its bytes, a file nothing",
  Effect.gen(function* () {
    yield* workspace;
    const tags = yield* makeFileTags;

    const listing = yield* tags.attach(".");
    const found = Option.getOrThrow(listing);
    expect(Predicate.isTagged(found, "TagText")).toBe(true);
    const text = Predicate.isTagged(found, "TagText") ? found.text : "";

    expect(text).toContain("src/");
    expect(text).not.toContain("out/");

    const picture = Option.getOrThrow(yield* tags.attach("shot.png"));
    expect(Predicate.isTagged(picture, "TagImage")).toBe(true);
    expect(picture).toMatchObject({ mediaType: "image/png" });

    expect(Option.isNone(yield* tags.attach("src/a.ts"))).toBe(true);
  }),
  testBaseServices,
);
