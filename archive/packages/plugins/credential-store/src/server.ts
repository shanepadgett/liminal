/** Credential-store's server: `credentials.db` in the data folder, readable only by the user. */

import { Effect, FileSystem, Layer } from "effect";

import { dataFile } from "@liminal/sdk";

import { sqliteStore } from "./server/sqlite-store.ts";

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const filename = yield* dataFile("credentials.db");

    yield* fs.writeFile(filename, new Uint8Array(), { flag: "a" });
    yield* fs.chmod(filename, 0o600);

    return sqliteStore(filename);
  }),
);
