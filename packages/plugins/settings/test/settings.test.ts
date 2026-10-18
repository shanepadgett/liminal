/** Settings: layer merging, project trust, per-section failures, and edits that keep comments. */

import { expect } from "bun:test";

import { Effect, FileSystem, Layer, Path, Schema } from "effect";

import { Directories, ProjectTrust } from "@liminal/sdk";
import { effectTest, serverOf, testBaseServices } from "@liminal/sdk/testing";

import settings from "../plugin.ts";
import { Settings } from "../src/contract.ts";

const stack = serverOf(settings).pipe(Layer.provideMerge(testBaseServices));

const Editor = Schema.Struct({
  theme: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("dark"))),
  font: Schema.optionalKey(Schema.Struct({ size: Schema.Int, family: Schema.String })),
  rulers: Schema.optionalKey(Schema.Array(Schema.Int)),
});

/** Writes `text` as the settings file of `layer`. */
const writeFile = (layer: "global" | "project", text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories = yield* Directories;

    yield* fs.writeFileString(path.join(directories[layer], "settings.json"), text);
  });

effectTest(
  "a missing section takes the Schema's defaults; project settings load once trusted",
  Effect.gen(function* () {
    const store = yield* Settings;
    expect(yield* store.section("editor", Editor)).toEqual({ theme: "dark" });

    yield* writeFile(
      "global",
      `{
        // the user's
        "editor": { "font": { "size": 12, "family": "Mono" }, "rulers": [80, 100] },
      }`,
    );

    yield* writeFile("project", `{ "editor": { "font": { "size": 14 }, "rulers": [120] } }`);

    const globalOnly = { theme: "dark", font: { size: 12, family: "Mono" }, rulers: [80, 100] };
    expect(yield* store.section("editor", Editor)).toEqual(globalOnly);
    yield* Effect.flatMap(ProjectTrust, (trust) => trust.trust);

    expect(yield* store.section("editor", Editor)).toEqual({
      theme: "dark",
      font: { size: 14, family: "Mono" },
      rulers: [120],
    });
  }),
  stack,
);

effectTest(
  "a bad section fails only its reader; a broken file fails every reader",
  Effect.gen(function* () {
    const store = yield* Settings;
    yield* writeFile("global", `{ "editor": { "theme": 3 }, "other": {} }`);

    const bad = yield* Effect.flip(store.section("editor", Editor));
    expect(bad.section).toBe("editor");
    expect(yield* store.section("other", Schema.Struct({}))).toEqual({});

    yield* writeFile("global", `{ "editor": `);
    const broken = yield* Effect.flip(store.section("other", Schema.Struct({})));
    expect(broken.message).toContain("settings.json");
  }),
  stack,
);

effectTest(
  "writes edit the file in place, keeping comments, and can remove a value",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories = yield* Directories;
    const store = yield* Settings;
    yield* writeFile("global", `{\n  // keep me\n  "editor": { "theme": "light" }\n}`);

    yield* store.write("global", ["editor", "rulers"], [80]);
    yield* store.write("global", ["editor", "theme"]);
    yield* store.write("project", ["editor", "theme"], "solar");

    const global = yield* fs.readFileString(path.join(directories.global, "settings.json"));
    expect(global).toContain("// keep me");
    expect(yield* store.section("editor", Editor)).toEqual({ theme: "dark", rulers: [80] });

    const project = yield* fs.readFileString(path.join(directories.project, "settings.json"));
    expect(JSON.parse(project)).toEqual({ editor: { theme: "solar" } });
  }),
  stack,
);
