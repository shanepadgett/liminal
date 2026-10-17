/**
 * Test base services: real FileSystem and Path, and Directories in a temp folder deleted with the
 * scope.
 */
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer, Path } from "effect";
import type { PlatformError } from "effect/PlatformError";

import { type BaseServices, Directories, EventBus, makeWork, Work } from "../core/index.ts";

const temporaryDirectories = Layer.effect(
  Directories,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-test-" });

    const directories = {
      global: path.join(root, "global"),
      project: path.join(root, "project"),
      data: path.join(root, "data"),
    };

    for (const directory of Object.values(directories)) {
      yield* fs.makeDirectory(directory, { recursive: true });
    }

    return directories;
  }),
);

/**
 * Work over the caller's own services: a use reads the calling fiber's context, and a started task
 * keeps the context of the fiber that started it.
 */
const callerWork = Layer.effect(
  Work,
  makeWork((f) => Effect.flatMap(Effect.context(), f)),
);

/** Every base service, with each test's folders in a fresh temp folder. */
export const testBaseServices: Layer.Layer<BaseServices, PlatformError> = Layer.mergeAll(
  temporaryDirectories,
  EventBus.layer,
  callerWork,
).pipe(Layer.provideMerge(BunServices.layer));
