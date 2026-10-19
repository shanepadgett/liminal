/** The folders Liminal reads and writes, supplied by the host to every plugin. */

import { Context, Effect, FileSystem, Path } from "effect";

export class Directories extends Context.Service<
  Directories,
  {
    /** The user's home folder, such as the parent of `~/.agents`. */
    readonly home: string;
    /** User-wide settings and plugins, shared by every project. */
    readonly global: string;
    /** The folder Liminal works in; relative paths from the model resolve against it. */
    readonly workspace: string;
    /** Settings and plugins of the project Liminal runs in: `<workspace>/.liminal`. */
    readonly project: string;
    /** Durable state such as the session database. */
    readonly data: string;
  }
>()("liminal/sdk/Directories") {}

/** The path of `name` in the data folder, which is created when missing. */
export const dataFile = Effect.fn("dataFile")(function* (name: string) {
  const directories = yield* Directories;
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(directories.data, { recursive: true });

  return (yield* Path.Path).join(directories.data, name);
});
