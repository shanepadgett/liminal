/** Isolated global skill and a relative symlink to a skill outside discovery roots. */

import { Effect, FileSystem, Path } from "effect";
import { RpcTest } from "effect/rpc";

import { Directories } from "@liminal/sdk";

import { SkillsRpcs } from "../src/contract.ts";

export const fixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* Directories;
  const root = path.join(directories.home, ".agents", "skills");
  const target = path.join(directories.temp, "source");
  const link = path.join(root, "linked");
  yield* fs.makeDirectory(root, { recursive: true });
  yield* fs.makeDirectory(target, { recursive: true });

  yield* fs.writeFileString(
    path.join(target, "SKILL.md"),
    "---\ndescription: Linked description\n---\nRead me.",
  );

  yield* fs.symlink(path.relative(root, target), link);
  const client = yield* RpcTest.makeClient(SkillsRpcs);

  return { fs, path, directories, root, target, link, client };
});

export const linked = Effect.fn("test.linked")(function* (
  client: Effect.Success<typeof fixture>["client"],
) {
  const folders = yield* client["skills/inventory"]();

  const entry = folders
    .flatMap((folder) => folder.entries)
    .find((skill) => skill.name === "linked");

  if (!entry) return yield* Effect.die("Missing fixture skill");

  return entry;
});
