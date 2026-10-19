/**
 * The `@` tag source for references: the clones by name, and the files of one once its tag is open.
 * Tags name the clone's folder with the home folder as `~`, so the files source attaches a tagged
 * folder's listing or picture by that path.
 */

import { Effect, Option, type Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { ranked, type TagRow, type TagSource, withFolders } from "@liminal/inbox/contract";

/** What the tag source works with. */
export interface TagTools {
  readonly path: Path.Path;
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  /** The folder of the clones, and the user's home folder. */
  readonly folder: string;
  readonly home: string;
  /** The names of the clones. */
  readonly names: Effect.Effect<ReadonlyArray<string>>;
}

/** `path` with the home folder written `~`. */
export const homeShort = (home: string, path: string) =>
  path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;

/** The files git does not ignore in `clone`; none when git cannot run. */
const filesIn = (tools: TagTools, clone: string) =>
  tools.spawner
    .string(
      ChildProcess.make("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
        cwd: clone,
      }),
    )
    .pipe(
      Effect.map((output) => output.split("\0").filter((part) => part !== "")),
      Effect.orElseSucceed((): ReadonlyArray<string> => []),
    );

/**
 * The clone a query opens, such as `opencode` in `~/.liminal/references/opencode/src`, and the
 * rest.
 */
const openedIn = (prefix: string, names: ReadonlyArray<string>, query: string) => {
  if (!query.startsWith(prefix)) return Option.none();
  const rest = query.slice(prefix.length);
  const slash = rest.indexOf("/");
  const name = rest.slice(0, slash);

  return slash > 0 && names.includes(name)
    ? Option.some({ name, rest: rest.slice(slash + 1) })
    : Option.none();
};

export const makeReferenceTags = (tools: TagTools): TagSource => {
  const prefix = `${homeShort(tools.home, tools.folder)}/`;

  const inside = (name: string, rest: string) =>
    Effect.map(filesIn(tools, tools.path.join(tools.folder, name)), (files) =>
      ranked(withFolders(files), rest).map((found): TagRow => ({
        kind: found.endsWith("/") ? "folder" : "file",
        path: `${name}/${found}`,
        tag: `${prefix}${name}/${found}`,
      })),
    );

  const clones = (names: ReadonlyArray<string>, query: string) =>
    ranked(names, query).map((name): TagRow => ({
      kind: "reference",
      path: `${name}/`,
      tag: `${prefix}${name}/`,
    }));

  return {
    find: (query) =>
      Effect.flatMap(tools.names, (names) =>
        Option.match(openedIn(prefix, names, query), {
          onNone: () => Effect.succeed(clones(names, query)),
          onSome: ({ name, rest }) => inside(name, rest),
        }),
      ),
    attach: () => Effect.succeedNone,
  };
};
