/**
 * The git reads and writes `/commit` needs, run through the command runner: the changed files and
 * their diff, recent subjects, committing a group of files, and pushing.
 */

import { Duration, Effect } from "effect";

import type { CommandRunner } from "@liminal/command-runner/contract";

import { type ChangedFile, CommitError, type PushTarget } from "../contract.ts";

/** Reads that stay on this machine. */
const LOCAL_TIMEOUT = Duration.seconds(30);

/** Files diffed at once. */
const DIFF_CONCURRENCY = 8;

/** Commits and pushes run hooks, which can run a project's checks. */
const WRITE_TIMEOUT = Duration.minutes(10);

const MS_PER_SECOND = 1000;

/** The tree of an empty repository, to diff against before the first commit. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Fields before the path in `git status --porcelain=v2` records, by record type. */
const FIELDS_BEFORE_PATH: ReadonlyMap<string, number> = new Map([
  ["1", 8],
  ["2", 9],
  ["u", 10],
  ["?", 1],
]);

/** No credential prompt can wait on a terminal no one sees. */
const ENV = { GIT_TERMINAL_PROMPT: "0" };

const quote = (arg: string) => `'${arg.replaceAll("'", String.raw`'\''`)}'`;

/** Git's own words when it gave any, else which command failed. */
const failureOf = (command: string, output: string) => {
  const lines = output.split("\n").flatMap((line) => (line.trim() === "" ? [] : [line.trim()]));
  const line = lines.find((each) => /^(fatal|error):/.test(each)) ?? lines.join("\n");

  return new CommitError({ message: line === "" ? `git ${command} failed.` : line });
};

const statusOf = (type: string, code: string): ChangedFile["status"] => {
  if (type === "?") return "untracked";
  if (type === "u") return "conflicted";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";

  return "modified";
};

/** The files of `git status --porcelain=v2 -z`; a rename's record is followed by its old path. */
export const parseStatus = (output: string): ReadonlyArray<ChangedFile> => {
  const records = output.split("\0");
  const files: ChangedFile[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    const type = record.slice(0, 1);
    const fields = FIELDS_BEFORE_PATH.get(type);

    if (fields !== undefined) {
      const path = record.split(" ").slice(fields).join(" ");
      const previousPath = type === "2" ? records[index + 1] : undefined;

      if (previousPath === undefined) {
        files.push({ path, status: statusOf(type, record.slice(2, 4)) });
      } else {
        index += 1;
        files.push({ path, previousPath, status: "renamed" });
      }
    }
  }

  return files;
};

/** Git through the command runner: `exec` gives any exit, `ok` fails unless git exits with 0. */
const makeRun = (runner: CommandRunner["Service"]) => {
  const exec = (root: string, args: ReadonlyArray<string>, timeout = LOCAL_TIMEOUT) =>
    runner.run({ command: `git ${args.map(quote).join(" ")}`, cwd: root, timeout, env: ENV }).pipe(
      Effect.mapError((error) => new CommitError({ message: error.message })),
      Effect.flatMap((result) =>
        result.end.type === "timed-out"
          ? Effect.fail(new CommitError({ message: `git ${args[0] ?? ""} took too long.` }))
          : Effect.succeed({ code: result.end.code, stdout: result.stdout, stderr: result.stderr }),
      ),
    );

  const ok = (root: string, args: ReadonlyArray<string>, timeout = LOCAL_TIMEOUT) =>
    exec(root, args, timeout).pipe(
      Effect.flatMap(({ code, stdout, stderr }) =>
        code === 0
          ? Effect.succeed(stdout)
          : Effect.fail(failureOf(args[0] ?? "", `${stderr}\n${stdout}`)),
      ),
    );

  /** The commit diffs compare with: HEAD, or the empty tree before the first commit. */
  const base = (root: string) =>
    exec(root, ["rev-parse", "--verify", "--quiet", "HEAD"]).pipe(
      Effect.map(({ code }) => (code === 0 ? "HEAD" : EMPTY_TREE)),
    );

  return { exec, ok, base };
};

type Run = ReturnType<typeof makeRun>;

/** Where the repository is and what changed in it. */
const makeReads = ({ exec, ok, base }: Run) => ({
  /** The top folder of the repository holding `folder`. */
  rootOf: (folder: string) =>
    exec(folder, ["rev-parse", "--show-toplevel"]).pipe(
      Effect.filterOrFail(
        ({ code }) => code === 0,
        () => new CommitError({ message: "Not in a git repository." }),
      ),
      Effect.map(({ stdout }) => stdout.trim()),
    ),

  /** Where `folder` sits in its repository, as a path from the top ending in `/`; empty at the top. */
  prefixOf: (folder: string) =>
    ok(folder, ["rev-parse", "--show-prefix"]).pipe(Effect.map((stdout) => stdout.trim())),

  /** Every changed file, untracked ones included. */
  changedFiles: (root: string) =>
    ok(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]).pipe(
      Effect.map(parseStatus),
    ),

  /** Each changed file's diff in the order of `files`, untracked ones shown as new files. */
  fileDiffs: Effect.fn("commit.diffs")(function* (root: string, files: ReadonlyArray<ChangedFile>) {
    const from = yield* base(root);

    return yield* Effect.forEach(
      files,
      ({ path, previousPath, status }) =>
        status === "untracked"
          ? exec(root, ["diff", "--no-color", "--no-index", "--", "/dev/null", path]).pipe(
              Effect.map(({ stdout }) => stdout),
            )
          : ok(root, [
              "diff",
              "--no-color",
              "--no-ext-diff",
              from,
              "--",
              ...(previousPath === undefined ? [path] : [previousPath, path]),
            ]),
      { concurrency: DIFF_CONCURRENCY },
    );
  }),

  /** The latest `count` subjects, the latest first; none before the first commit. */
  recentSubjects: (root: string, count: number) =>
    exec(root, ["log", `-${count}`, "--format=%s"]).pipe(
      Effect.map(({ code, stdout }) =>
        code === 0 ? stdout.split("\n").filter((line) => line !== "") : [],
      ),
    ),

  /** When HEAD was committed, in milliseconds since 1970; 0 before the first commit. */
  headTime: (root: string) =>
    exec(root, ["log", "-1", "--format=%ct"]).pipe(
      Effect.map(({ code, stdout }) =>
        code === 0 && stdout.trim() !== "" ? Number(stdout.trim()) * MS_PER_SECOND : 0,
      ),
    ),
});

/** The branch's upstream, else `origin/<branch>` as new; null when no branch is checked out. */
const pushTargetOf = ({ exec, ok }: Run) =>
  Effect.fn("commit.pushTarget")(function* (root: string) {
    const upstream = yield* exec(root, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);

    if (upstream.code === 0) {
      const target: PushTarget = { name: upstream.stdout.trim(), branch: "", isNew: false };

      return target;
    }

    const branch = (yield* ok(root, ["branch", "--show-current"])).trim();
    if (branch === "") return null;

    const target: PushTarget = { name: `origin/${branch}`, branch, isNew: true };

    return target;
  });

/** Committing a group of files, and pushing. */
const makeWrites = (run: Run) => ({
  /** Commits exactly `paths` with `message`, whatever was staged before, and gives its short hash. */
  commitFiles: Effect.fn("commit.files")(function* (
    root: string,
    paths: ReadonlyArray<string>,
    message: string,
  ) {
    if ((yield* run.base(root)) === "HEAD") yield* run.ok(root, ["reset", "--mixed", "--quiet"]);
    yield* run.ok(root, ["add", "-A", "--", ...paths]);

    if ((yield* run.ok(root, ["diff", "--cached", "--name-only"])).trim() === "") {
      return yield* new CommitError({ message: `git add staged nothing of ${paths.join(", ")}.` });
    }

    yield* run.ok(root, ["commit", "--quiet", "-m", message], WRITE_TIMEOUT);

    return (yield* run.ok(root, ["rev-parse", "--short", "HEAD"])).trim();
  }),

  pushTarget: pushTargetOf(run),

  /** Pushes the branch, setting its upstream when it has none. */
  push: (root: string, target: PushTarget) =>
    run
      .ok(
        root,
        target.isNew ? ["push", "--set-upstream", "origin", target.branch] : ["push"],
        WRITE_TIMEOUT,
      )
      .pipe(Effect.asVoid),
});

export type Git = ReturnType<typeof makeGit>;

export const makeGit = (runner: CommandRunner["Service"]) => {
  const run = makeRun(runner);

  return { ...makeReads(run), ...makeWrites(run) };
};
