/** Which `git` invocations only read the repository. */

import { isOneOf, positionals, usesOption } from "./flags.ts";

const readVerbs = new Set([
  "status",
  "log",
  "diff",
  "show",
  "blame",
  "rev-parse",
  "describe",
  "ls-files",
  "ls-tree",
  "cat-file",
  "rev-list",
  "name-rev",
  "merge-base",
  "reflog",
  "grep",
  "for-each-ref",
  "shortlog",
  "version",
  "help",
  "count-objects",
  "whatchanged",
  "cherry",
  "range-diff",
  "var",
]);

/** Options that write files or run other programs, even under a read verb. */
const runsOrWrites = [
  "--output",
  "--ext-diff",
  "--textconv",
  "--filters",
  "--exec",
  "--open-files-in-pager",
];

const reflogWrites = new Set(["expire", "delete", "drop"]);

const readVerbAllowed = (verb: string, rest: ReadonlyArray<string>): boolean => {
  if (usesOption(rest, verb === "grep" ? ["O"] : [], runsOrWrites)) return false;
  if (verb === "reflog") return !reflogWrites.has(positionals(rest)[0] ?? "");

  return true;
};

const listOptions = [
  "-a",
  "-r",
  "-v",
  "-vv",
  "-l",
  "-n",
  "--all",
  "--remotes",
  "--verbose",
  "--list",
  "--show-current",
  "--color",
  "--no-color",
  "--column",
  "--no-column",
  "--sort",
  "--format",
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
];

const listModes = [
  "-l",
  "--list",
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
];

/**
 * `git branch` and `git tag` only list when every option is a listing one and any name comes with a
 * listing mode; a bare name would create a branch or tag.
 */
const listsOnly = (rest: ReadonlyArray<string>): boolean =>
  rest.every((arg) => !arg.startsWith("-") || isOneOf(arg, listOptions))
  && (positionals(rest).length === 0 || rest.some((arg) => isOneOf(arg, listModes)));

const remoteReads = new Set(["show", "get-url"]);
const remoteOptions = new Set(["-v", "--verbose", "-n", "--push", "--all"]);

/** `git remote` lists, shows or prints a URL; every other subcommand changes the config. */
const remoteAllowed = (rest: ReadonlyArray<string>): boolean => {
  const [subcommand] = positionals(rest);

  return (
    rest.every((arg) => !arg.startsWith("-") || remoteOptions.has(arg))
    && (subcommand === undefined || remoteReads.has(subcommand))
  );
};

/** Global options other than `--no-pager` can point git at other repositories or programs. */
export const gitAllowed = (args: ReadonlyArray<string>): boolean => {
  const [verb, ...rest] = args[0] === "--no-pager" ? args.slice(1) : args;

  if (verb === undefined || verb === "--version" || verb === "--help") return rest.length === 0;
  if (readVerbs.has(verb)) return readVerbAllowed(verb, rest);
  if (verb === "branch" || verb === "tag") return listsOnly(rest);
  if (verb === "remote") return remoteAllowed(rest);

  return false;
};
