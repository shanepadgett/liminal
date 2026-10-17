/** Session-store's server: the SQLite store at `sessions.db` in the data folder. */

import { Effect, FileSystem, Layer, Path } from "effect";

import { Directories } from "@liminal/sdk";

import { sqliteStore } from "./server/sqlite-store.ts";

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const directories = yield* Directories;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(directories.data, { recursive: true });

    return sqliteStore(path.join(directories.data, "sessions.db"));
  }),
);
