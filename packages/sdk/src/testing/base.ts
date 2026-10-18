/**
 * Test base services: real FileSystem and Path, and Directories in a temp folder deleted with the
 * scope.
 */
import { BunServices } from "@effect/platform-bun";
import { Effect, FileSystem, Layer, Path, Ref } from "effect";
import type { PlatformError } from "effect/PlatformError";

import {
  type BaseServices,
  Directories,
  EventBus,
  makeTurnGate,
  makeWork,
  ProjectTrust,
  TurnGate,
  Work,
} from "../core/index.ts";

const temporaryDirectories = Layer.effect(
  Directories,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "liminal-test-" });

    const directories = {
      home: path.join(root, "home"),
      global: path.join(root, "global"),
      workspace: root,
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

/** A gate no reload ever closes, since tests run no kernel. */
const openGate = Layer.effect(
  TurnGate,
  Effect.map(makeTurnGate, (made) => made.gate),
);

/** Trust held in memory: untrusted until `trust` runs. */
const memoryTrust = Layer.effect(
  ProjectTrust,
  Effect.map(Ref.make(false), (trusted) =>
    ProjectTrust.of({ trusted: Ref.get(trusted), trust: Ref.set(trusted, true) }),
  ),
);

/** Every base service, with each test's folders in a fresh temp folder. */
export const testBaseServices: Layer.Layer<BaseServices, PlatformError> = Layer.mergeAll(
  temporaryDirectories,
  memoryTrust,
  EventBus.layer,
  callerWork,
  openGate,
).pipe(Layer.provideMerge(BunServices.layer));
