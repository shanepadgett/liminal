/** The folders Liminal reads and writes. */
import { Context, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

export class Directories extends Context.Service<
  Directories,
  {
    /** User-wide files shared by every project: `~/.liminal`. */
    readonly global: string;
    /** The folder Liminal works in; relative paths resolve against it. */
    readonly workspace: string;
    /** The project's own files: `<workspace>/.liminal`. */
    readonly project: string;
  }
>()("directories/Directories") {}

/** Where the session runs, as a screen shows it. */
export const Workspace = Schema.Struct({
  /** The workspace folder, the home folder written `~`. */
  folder: Schema.String,
  /** The Git branch checked out, or a short commit id; missing outside a repository. */
  branch: Schema.optional(Schema.String),
});

export type Workspace = typeof Workspace.Type;

/** What screens call. */
export class DirectoriesRpc extends RpcGroup.make(
  Rpc.make("directories/workspace", { success: Workspace }),
) {}
