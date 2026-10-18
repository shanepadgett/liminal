/** Files' server: workspace files over the platform file system. */

import { Effect, FileSystem, Layer, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

import { Directories } from "@liminal/sdk";

import { FileFailed, WorkspaceFiles } from "./contract.ts";

/** A platform failure as `FileFailed`, naming the file as the caller gave it. */
const failed = (file: string) => (error: PlatformError) =>
  new FileFailed({ path: file, message: error.message });

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workspace } = yield* Directories;

  const resolve = (file: string) => path.resolve(workspace, file);

  return WorkspaceFiles.of({
    resolve,
    read: (file) => fs.readFileString(resolve(file)).pipe(Effect.mapError(failed(file))),
    write: (file, content) =>
      Effect.gen(function* () {
        const target = resolve(file);
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        yield* fs.writeFileString(target, content);
      }).pipe(Effect.mapError(failed(file))),
  });
});

export const layer = Layer.effect(WorkspaceFiles, make);
