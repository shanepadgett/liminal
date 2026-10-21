/** Workspace files: the one way tools read and write files, so rules about files have one home. */

import { Context, type Effect, Schema } from "effect";

/** A file could not be read or written; `path` is as the caller gave it. */
export class FileFailed extends Schema.TaggedError<FileFailed, { readonly brand: unique symbol }>()(
  "FileFailed",
  { path: Schema.String, message: Schema.String },
) {}

export class WorkspaceFiles extends Context.Service<
  WorkspaceFiles,
  {
    /** `file` as an absolute path; a relative one resolves in the workspace. */
    readonly resolve: (file: string) => string;
    readonly read: (file: string) => Effect.Effect<string, FileFailed>;
    /** Writes the whole file, making its folders. */
    readonly write: (file: string, content: string) => Effect.Effect<void, FileFailed>;
  }
>()("liminal/files/WorkspaceFiles") {}
