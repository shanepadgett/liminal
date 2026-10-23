/** Commands that only read, and the argument checks that keep them so; ported from Tau's allowlist. */

/**
 * Read-only whatever their arguments. `cd` is left out: after it, relative paths leave the
 * workspace.
 */
const ALWAYS = new Set([
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
  "jq",
]);

const FIND_VETO = new Set([
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

const GIT_READ_VERBS = new Set([
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

const GIT_QUIET_FLAGS = new Set(["--no-pager", "-P", "--no-color"]);
const GIT_RUN_FLAGS = ["output", "ext-diff", "textconv", "exec"];
const BRANCH_FLAGS = new Set(["--list", "--all", "--remotes", "--verbose", "--show-current"]);
const SED_PRINT = /^(?:\d+|\d+,\d+)p$/u;

type Args = ReadonlyArray<string>;

/** The arguments before `--`, where options can appear. */
const optionsOf = (args: Args) => {
  const end = args.indexOf("--");

  return end === -1 ? args : args.slice(0, end);
};

const hasShortOption = (args: Args, letter: string) =>
  optionsOf(args).some(
    (arg) => arg.length > 1 && arg.startsWith("-") && !arg.startsWith("--") && arg.includes(letter),
  );

const isLongOption = (arg: string, name: string) =>
  arg === `--${name}` || arg.startsWith(`--${name}=`);

const hasLongOption = (args: Args, ...names: ReadonlyArray<string>) =>
  optionsOf(args).some((arg) => names.some((name) => isLongOption(arg, name)));

/** Getopt_long takes any unambiguous prefix, so `--comp=x` is `--compress-program=x`. */
const hasLongPrefix = (args: Args, name: string) =>
  optionsOf(args).some((arg) => {
    const given = arg.startsWith("--") ? (arg.slice(2).split("=", 1)[0] ?? "") : "";

    return given !== "" && name.startsWith(given);
  });

const hasOutputFlag = (args: Args) => hasShortOption(args, "o") || hasLongPrefix(args, "output");

/** Every argument that is not an option, counting option values so callers err toward review. */
const positionalCount = (args: Args) => {
  const end = args.indexOf("--");
  const options = optionsOf(args);
  const after = end === -1 ? 0 : args.length - end - 1;

  return options.filter((arg) => !arg.startsWith("-") || arg === "-").length + after;
};

const isPrintingSed = (args: Args) => {
  const [flag, script, ...files] = args;

  return (
    flag === "-n"
    && script !== undefined
    && SED_PRINT.test(script)
    && files.every((arg) => arg === "--" || !arg.startsWith("-"))
  );
};

const isListingBranch = (args: Args) =>
  args.every(
    (arg, index) =>
      BRANCH_FLAGS.has(arg)
      || isLongOption(arg, "format")
      || /^-[alrv]+$/u.test(arg)
      || args[index - 1] === "--format",
  );

const isShowingRemote = (args: Args) => {
  const verb = args.find((arg) => arg !== "-v" && arg !== "--verbose");

  return verb === undefined || verb === "show" || verb === "get-url";
};

const isListFlag = (arg: string) => arg === "--list" || /^-l+$/u.test(arg);

const isListingTag = (args: Args) => {
  const first = args.findIndex(isListFlag);

  const listed = (arg: string, index: number) =>
    isListFlag(arg) || (index > first && !arg.startsWith("-"));

  return args.length === 0 || (first !== -1 && args.every(listed));
};

const isReadingGit = (args: Args) => {
  const verbAt = args.findIndex((arg) => !GIT_QUIET_FLAGS.has(arg));
  const verb = args[verbAt];

  const runs = optionsOf(args).some(
    (arg) => arg === "--paginate" || GIT_RUN_FLAGS.some((name) => isLongOption(arg, name)),
  );

  if (runs || verb === undefined || verb.startsWith("-")) return false;

  const rest = args.slice(verbAt + 1);

  if (verb === "branch") return isListingBranch(rest);
  if (verb === "remote") return isShowingRemote(rest);
  if (verb === "tag") return isListingTag(rest);

  return GIT_READ_VERBS.has(verb);
};

const RULES = new Map<string, (args: Args) => boolean>([
  ["find", (args) => !args.some((arg) => FIND_VETO.has(arg))],
  [
    "fd",
    (args) =>
      !hasShortOption(args, "x")
      && !hasShortOption(args, "X")
      && !hasLongOption(args, "exec", "exec-batch"),
  ],
  [
    "rg",
    (args) =>
      !hasShortOption(args, "z") && !hasLongOption(args, "pre", "hostname-bin", "search-zip"),
  ],
  ["sort", (args) => !hasOutputFlag(args) && !hasLongPrefix(args, "compress-program")],
  ["base64", (args) => !hasOutputFlag(args)],
  ["iconv", (args) => !hasOutputFlag(args)],
  ["file", (args) => !hasShortOption(args, "C") && !hasLongPrefix(args, "compile")],
  ["tree", (args) => !hasOutputFlag(args)],
  // A second positional argument is an output file.
  ["uniq", (args) => positionalCount(args) <= 1],
  [
    "xxd",
    (args) =>
      !hasShortOption(args, "r") && !hasLongOption(args, "revert") && positionalCount(args) <= 1,
  ],
  ["yq", (args) => !hasShortOption(args, "i") && !hasLongOption(args, "inplace", "in-place")],
  ["sed", isPrintingSed],
  ["hostname", (args) => positionalCount(args) === 0],
  ["date", (args) => !hasShortOption(args, "s") && !hasLongOption(args, "set")],
  ["git", isReadingGit],
]);

/** Whether `name` with these arguments only reads. */
export const onlyReads = (name: string, args: Args): boolean =>
  ALWAYS.has(name) || (RULES.get(name)?.(args) ?? false);
