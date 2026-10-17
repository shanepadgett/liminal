/** Credential-store's server: `credentials.db` in the data folder, readable only by the user. */

import { Effect, FileSystem, Layer, Path } from "effect";

import { Directories } from "@liminal/sdk";

import { sqliteStore } from "./server/sqlite-store.ts";

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const directories = yield* Directories;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const filename = path.join(directories.data, "credentials.db");

    yield* fs.makeDirectory(directories.data, { recursive: true });
    yield* fs.writeFile(filename, new Uint8Array(), { flag: "a" });
    yield* fs.chmod(filename, 0o600);

    return sqliteStore(filename);
  }),
);
