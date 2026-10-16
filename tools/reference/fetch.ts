/** Copies one dependency's documentation files from its installed package or its Git repository. */
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { Schema } from "effect";

import { runCommand } from "../run.ts";
import type { DocSet, GitRef } from "./manifest.ts";

const TEXT_FILE = /\.(md|mdx|txt|rst|html|ts)$/u;

const InstalledPackage = Schema.Struct({ version: Schema.String });
const decodeInstalledPackage = Schema.decodeUnknownSync(InstalledPackage);

/** Where one dependency's docs go, and the folder it is installed in when it is a package. */
export interface Target {
  readonly name: string;
  readonly version: string;
  readonly destination: string;
  readonly installed: string | undefined;
}

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const { stdout, stderr, code } = await runCommand(["git", ...args], cwd);

  if (code !== 0) throw new Error(`git ${args.join(" ")} failed (${code}):\n${stdout}${stderr}`);

  return stdout.trim();
};

export const relativePath = (path: string): string => {
  const unsafe =
    path === ""
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((part) => part === ".." || part === ".git" || part === "");

  if (unsafe) throw new Error(`Expected a relative documentation path: ${path}`);

  return path;
};

const matches = (patterns: readonly string[], file: string): boolean =>
  patterns.some((pattern) => new Bun.Glob(pattern).match(file));

const copyFile = async (root: string, file: string, destination: string): Promise<void> => {
  if (!TEXT_FILE.test(file)) throw new Error(`Not a documentation text file: ${file}`);

  const target = join(destination, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(root, file), target);
};

/** Copies the files a set names from `root` into `destination`, keeping their relative paths. */
const copyFiles = async (target: Target, set: DocSet, root: string): Promise<void> => {
  if (set.files.length === 0) throw new Error(`No documentation requested for ${target.name}`);

  const exclude = (set.exclude ?? []).map(relativePath);

  const copyPattern = async (pattern: string): Promise<void> => {
    const files = await Array.fromAsync(
      new Bun.Glob(relativePath(pattern)).scan({ cwd: root, onlyFiles: true }),
    );

    if (files.length === 0) throw new Error(`Missing documentation for ${target.name}: ${pattern}`);

    const kept = files.filter((file) => !matches(exclude, relativePath(file)));
    await Promise.all(kept.map((file) => copyFile(root, file, target.destination)));
  };

  await Promise.all(set.files.map(copyPattern));
};

/** The leading path segments of a glob that contain no wildcard. */
const literalPrefix = (pattern: string): string => {
  const parts = relativePath(pattern).split("/");
  const wildcard = parts.findIndex((part) => part.includes("*"));

  return (wildcard === -1 ? parts : parts.slice(0, wildcard)).join("/");
};

const refName = (ref: GitRef, version: string): string =>
  "tag" in ref ? ref.tag.replaceAll("{version}", version) : ref.branch;

const copyInstalled = async (target: Target, set: DocSet): Promise<void> => {
  if (target.installed === undefined)
    throw new Error(`${target.name} is not an installed package; use a git origin`);

  const installed = decodeInstalledPackage(
    await Bun.file(join(target.installed, "package.json")).json(),
  );

  if (installed.version !== target.version)
    throw new Error(
      `Installed version mismatch for ${target.name}: expected ${target.version}, got ${installed.version}`,
    );

  await copyFiles(target, set, target.installed);
};

const copyFromGit = async (
  target: Target,
  set: DocSet,
  repository: string,
  ref: GitRef,
): Promise<string> => {
  if ("tag" in ref && !ref.tag.includes("{version}"))
    throw new Error(`Missing version in tag pattern for ${target.name}`);

  const temporary = await mkdtemp(join(tmpdir(), "liminal-reference-"));

  try {
    const roots = [...new Set(set.files.map((file) => `/${literalPrefix(file)}`))];
    const branch = refName(ref, target.version);

    await git(temporary, [
      "clone",
      "--depth=1",
      "--filter=blob:none",
      "--no-checkout",
      "--branch",
      branch,
      "--",
      repository,
      "repository",
    ]);

    const root = join(temporary, "repository");
    await git(root, ["sparse-checkout", "set", "--no-cone", "--", ...roots]);
    await git(root, ["checkout", "--detach"]);
    await copyFiles(target, set, root);

    return await git(root, ["rev-parse", "HEAD"]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};

/** Copies one set of docs for a dependency. Returns the commit a Git origin was copied from. */
export const fetchDocs = async (target: Target, set: DocSet): Promise<string | undefined> => {
  if (set.origin.kind === "git")
    return copyFromGit(target, set, set.origin.repository, set.origin.ref);

  await copyInstalled(target, set);

  return undefined;
};
