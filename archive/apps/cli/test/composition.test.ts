/** `plugins.json`: choices layered global then project, and the project read only once trusted. */

import { expect } from "bun:test";

import { Context, Effect, FileSystem, Layer, Path } from "effect";

import { Directories, ProjectTrust } from "@liminal/sdk";
import { effectTest, testBaseServices } from "@liminal/sdk/testing";

import { pluginsFolder } from "../src/boot.ts";
import { compositionFiles, projectTrust, readComposition } from "../src/composition.ts";

effectTest(
  "the project's choices and plugins count only once the workspace is trusted",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories = yield* Directories;
    const files = yield* compositionFiles;
    const trust = Context.get(yield* Layer.build(projectTrust), ProjectTrust);
    const userPlugins = path.join(directories.global, "plugins");

    expect(yield* readComposition).toEqual({
      folders: [pluginsFolder(path), userPlugins],
      choices: new Map(),
    });

    yield* fs.writeFileString(
      files.global,
      `{
  // mine
  "plugins": { "tools-shell": false, "agents-files": true },
}`,
    );

    yield* fs.writeFileString(files.project, `{ "plugins": { "agents-files": false } }`);
    const untrusted = yield* readComposition;
    expect(untrusted.choices.get("agents-files")).toBe(true);
    expect(yield* trust.trusted).toBe(false);

    yield* trust.trust;
    yield* trust.trust;
    expect(yield* trust.trusted).toBe(true);
    expect(yield* fs.readFileString(files.global)).toContain("// mine");

    expect(yield* readComposition).toEqual({
      folders: [pluginsFolder(path), userPlugins, path.join(directories.project, "plugins")],
      choices: new Map([
        ["tools-shell", false],
        ["agents-files", false],
      ]),
    });
  }),
  testBaseServices,
);

effectTest(
  "a trusted folder trusts its subfolders, not a sibling that shares its name's start",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { workspace } = yield* Directories;
    const files = yield* compositionFiles;
    const trust = Context.get(yield* Layer.build(projectTrust), ProjectTrust);

    const trustOnly = (folder: string) =>
      fs.writeFileString(files.global, JSON.stringify({ trustedFolders: [folder] }));

    yield* trustOnly(`${workspace}x`);
    expect(yield* trust.trusted).toBe(false);

    yield* trustOnly(path.dirname(workspace));
    expect(yield* trust.trusted).toBe(true);

    const before = yield* fs.readFileString(files.global);
    yield* trust.trust;
    expect(yield* fs.readFileString(files.global)).toBe(before);
  }),
  testBaseServices,
);

effectTest(
  "a plugins.json of the wrong shape names its file",
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const files = yield* compositionFiles;
    yield* fs.writeFileString(files.global, `{ "plugins": { "tools-shell": "off" } }`);

    const error = yield* Effect.flip(readComposition);
    expect(error.file).toBe(files.global);
  }),
  testBaseServices,
);
