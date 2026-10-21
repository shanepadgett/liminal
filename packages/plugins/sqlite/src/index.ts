/** `liminal.db` in the global folder through Bun's SQLite, provided as Effect's `SqlClient`. */
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Effect, FileSystem, Layer, Path } from "effect";
import { SqlClient } from "effect/sql";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";

const database = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directories = yield* Directories;
  const filename = path.join(directories.global, "liminal.db");

  // Credentials live here, so only the user may read the file. SQLite creates the WAL files with
  // the database file's mode, so creating it first covers them too; an existing file is untouched.
  yield* fs.makeDirectory(directories.global, { recursive: true });
  yield* fs.writeFile(filename, new Uint8Array(), { flag: "a", mode: 0o600 });

  return SqliteClient.layer({ filename });
});

export default definePlugin({
  name: "sqlite",
  provides: [SqlClient.SqlClient],
  requires: [Directories, FileSystem.FileSystem, Path.Path],
  layer: Layer.unwrap(database),
});
