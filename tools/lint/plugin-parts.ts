/** Where a file sits in a plugin package: which plugin, and which part of it. */
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

export type PluginPart = "manifest" | "contract" | "server" | "tui" | "test" | "other";

export interface PluginLocation {
  readonly plugin: string;
  readonly part: PluginPart;
}

/** Exact files that are a part on their own. */
const partFiles = new Map<string, PluginPart>([
  ["plugin.ts", "manifest"],
  ["src/contract.ts", "contract"],
  ["src/server.ts", "server"],
  ["src/tui.tsx", "tui"],
]);

/** Folders whose whole subtree belongs to one part. */
const partFolders = new Map<string, PluginPart>([
  ["test", "test"],
  ["src/server", "server"],
  ["src/tui", "tui"],
]);

const partOf = (rest: readonly string[]): PluginPart => {
  const file = partFiles.get(rest.join("/"));
  if (file !== undefined) return file;

  for (const depth of [1, 2]) {
    const folder = partFolders.get(rest.slice(0, depth).join("/"));
    if (folder !== undefined && rest.length > depth) return folder;
  }

  return "other";
};

/** Locates a repository-relative path inside `plugins/<name>/`, or returns undefined. */
export const locate = (path: string): PluginLocation | undefined => {
  const segments = normalize(path).split(sep);
  const [area, plugin, ...rest] = segments;
  if (area !== "plugins" || plugin === undefined || rest.length === 0) return undefined;

  return { plugin, part: partOf(rest) };
};

/** The repository-relative path of the linted file. */
export const repoPath = (cwd: string, filename: string): string =>
  isAbsolute(filename) ? relative(cwd, filename) : filename;

/** Resolves a relative import specifier against the importing file; bare specifiers stay undefined. */
export const resolveRelative = (fromPath: string, specifier: string): string | undefined =>
  specifier.startsWith(".") ? join(dirname(fromPath), specifier) : undefined;
