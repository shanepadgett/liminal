/** Where a file sits in a plugin package: which plugin, and which of its entries. */
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

export type PluginEntry = "contract" | "plugin" | "tui" | "web" | "test" | "other";

export interface PluginLocation {
  readonly plugin: string;
  readonly entry: PluginEntry;
}

/** Exact files that start an entry other than the plugin entry. */
const entryFiles = new Map<string, PluginEntry>([
  ["src/contract.ts", "contract"],
  ["src/tui.tsx", "tui"],
  ["src/web.tsx", "web"],
]);

/** Folders whose whole subtree belongs to one entry. */
const entryFolders = new Map<string, PluginEntry>([
  ["test", "test"],
  ["src/tui", "tui"],
  ["src/web", "web"],
]);

/** Any other file under `src/` belongs to the plugin entry, which starts at `src/index.ts`. */
const entryOf = (rest: readonly string[]): PluginEntry => {
  const file = entryFiles.get(rest.join("/"));
  if (file !== undefined) return file;

  for (const depth of [1, 2]) {
    const folder = entryFolders.get(rest.slice(0, depth).join("/"));
    if (folder !== undefined && rest.length > depth) return folder;
  }

  return rest[0] === "src" && rest.length > 1 ? "plugin" : "other";
};

/** Locates a repository-relative path inside `packages/plugins/<name>/`, or returns undefined. */
export const locate = (path: string): PluginLocation | undefined => {
  const segments = normalize(path).split(sep);
  const [root, area, plugin, ...rest] = segments;

  if (root !== "packages" || area !== "plugins" || plugin === undefined || rest.length === 0)
    return undefined;

  return { plugin, entry: entryOf(rest) };
};

/** The repository-relative path of the linted file. */
export const repoPath = (cwd: string, filename: string): string =>
  isAbsolute(filename) ? relative(cwd, filename) : filename;

/** Resolves a relative import specifier against the importing file; bare specifiers stay undefined. */
export const resolveRelative = (fromPath: string, specifier: string): string | undefined =>
  specifier.startsWith(".") ? join(dirname(fromPath), specifier) : undefined;
