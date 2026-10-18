/** What a set of changed files asks for: plugin packages loaded fresh, or a new process. */

import { Data, type Path } from "effect";

export type Change = Data.TaggedEnum<{
  /** Files in these plugin package folders changed; the kernel swaps in a new graph. */
  Plugins: { readonly packages: ReadonlySet<string> };
  /** Code the running process loaded at start changed; only a new process picks it up. */
  Restart: {};
}>;

export const Change = Data.taggedEnum<Change>();

/** Where watched files live. */
export interface Watched {
  /** Folders whose packages hold plugins. */
  readonly folders: ReadonlyArray<string>;
  /** Folders of code loaded at start, such as the kernel's own. */
  readonly restartRoots: ReadonlyArray<string>;
}

const isInside = (path: Path.Path, dir: string, file: string) => {
  const relative = path.relative(dir, file);

  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

/** The package folder holding `file`: the first folder below a plugins folder. */
const packageOf = (path: Path.Path, folders: ReadonlyArray<string>, file: string) => {
  const folder = folders.find((each) => isInside(path, each, file));

  return folder === undefined
    ? undefined
    : path.join(folder, path.relative(folder, file).split(path.sep)[0] ?? "");
};

/** One change for `files`; none when no file is watched code. */
export const classify = (
  path: Path.Path,
  watched: Watched,
  files: ReadonlyArray<string>,
): Change | undefined => {
  if (files.some((file) => watched.restartRoots.some((root) => isInside(path, root, file))))
    return Change.Restart();

  const packages = new Set(files.flatMap((file) => packageOf(path, watched.folders, file) ?? []));

  return packages.size === 0 ? undefined : Change.Plugins({ packages });
};

/** Both changes as one; a restart picks up everything. */
export const merge = (first: Change, second: Change): Change =>
  Change.$is("Plugins")(first) && Change.$is("Plugins")(second)
    ? Change.Plugins({ packages: new Set([...first.packages, ...second.packages]) })
    : Change.Restart();
