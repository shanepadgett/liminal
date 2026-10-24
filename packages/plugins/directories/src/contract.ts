/** The folders Liminal reads and writes. */
import { Context, type Effect, Option, type Path, Schema } from "effect";
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
    /** The folder holding `.git`: the workspace or the nearest folder above it, found at start. */
    readonly repository: Option.Option<string>;
    /** The Git branch checked out, or a short commit id; read on each call. */
    readonly branch: Effect.Effect<Option.Option<string>>;
  }
>()("directories/Directories") {}

/** `folder` and each folder above it up to `root`, nearest first. */
const foldersUp = (path: Path.Path, folder: string, root: string): ReadonlyArray<string> => {
  const parent = path.dirname(folder);

  return folder === root || parent === folder
    ? [folder]
    : [folder, ...foldersUp(path, parent, root)];
};

/** The repository root down to the workspace; the workspace alone outside a repository. */
export const foldersDown = (
  path: Path.Path,
  { workspace, repository }: Directories["Service"],
): ReadonlyArray<string> =>
  Option.match(repository, {
    onNone: () => [workspace],
    onSome: (root) => foldersUp(path, workspace, root).toReversed(),
  });

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
