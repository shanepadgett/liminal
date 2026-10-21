/** The built-in read-only commands, and the argument checks for those that can also write. */

import { positionals, usesOption, usesWord } from "./flags.ts";
import { gitAllowed } from "./git.ts";

/** Commands that only read whatever their arguments. */
const alwaysSafe = new Set([
  "cat",
  "head",
  "tail",
  "wc",
  "ls",
  "pwd",
  "echo",
  "printf",
  "true",
  "false",
  "test",
  "[",
  "grep",
  "egrep",
  "fgrep",
  "cut",
  "tr",
  "comm",
  "cmp",
  "paste",
  "join",
  "column",
  "fmt",
  "fold",
  "nl",
  "rev",
  "tac",
  "expand",
  "unexpand",
  "tsort",
  "pr",
  "seq",
  "expr",
  "getconf",
  "id",
  "whoami",
  "uname",
  "printenv",
  "type",
  "which",
  "dirname",
  "basename",
  "readlink",
  "realpath",
  "stat",
  "du",
  "df",
  "diff",
  "md5sum",
  "sha1sum",
  "sha256sum",
  "shasum",
  "ps",
  "uptime",
  "sleep",
  "cd",
  "jq",
]);

const findActions = new Set([
  "-exec",
  "-execdir",
  "-ok",
  "-okdir",
  "-delete",
  "-fls",
  "-fprint",
  "-fprint0",
  "-fprintf",
]);

const sedPrint = /^(?:\d+|\$)(?:,(?:\d+|\$))?p$/u;

/** `sed` only as `sed -n <line or range>p [files]`, which prints and never edits. */
const sedPrintsOnly = (args: ReadonlyArray<string>): boolean => {
  const [flag, script, ...files] = args;

  return (
    flag === "-n"
    && script !== undefined
    && sedPrint.test(script)
    && files.every((file) => !file.startsWith("-"))
  );
};

type ArgCheck = (args: ReadonlyArray<string>) => boolean;

const outputFlag: ArgCheck = (args) => !usesOption(args, ["o"], ["--output"]);

/** Commands that read by default but have options that write files or run other programs. */
const checked: ReadonlyMap<string, ArgCheck> = new Map<string, ArgCheck>([
  ["find", (args) => !usesWord(args, findActions)],
  ["fd", (args) => !usesOption(args, ["x", "X"], ["--exec", "--exec-batch"])],
  ["rg", (args) => !usesOption(args, ["z"], ["--pre", "--hostname-bin", "--search-zip"])],
  ["sort", (args) => !usesOption(args, ["o"], ["--output", "--compress-program"])],
  ["base64", outputFlag],
  ["iconv", outputFlag],
  ["tree", outputFlag],
  ["file", (args) => !usesOption(args, ["C"], ["--compile"])],
  ["uniq", (args) => positionals(args).length <= 1],
  ["xxd", (args) => positionals(args).length <= 1 && !args.some((arg) => /^--?r/u.test(arg))],
  ["yq", (args) => !usesOption(args, ["i"], ["--inplace", "--in-place"])],
  ["sed", sedPrintsOnly],
  ["hostname", (args) => positionals(args).length === 0],
  [
    "date",
    (args) =>
      !usesOption(args, ["s"], ["--set"]) && positionals(args).every((arg) => arg.startsWith("+")),
  ],
  ["git", gitAllowed],
]);

/** True when the built-in rules let `name` run with `args`, which must all be known. */
export const builtInAllows = (name: string, args: ReadonlyArray<string>): boolean => {
  if (alwaysSafe.has(name)) return true;
  const check = checked.get(name);

  return check !== undefined && check(args);
};

/** True when `name` has argument checks, so its arguments must be known before it runs. */
export const needsKnownArgs = (name: string): boolean => checked.has(name);
