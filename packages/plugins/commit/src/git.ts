/**
 * The git reads and writes `/commit` needs: the changed files and their diffs, recent subjects,
 * committing a group of files, and pushing. Git runs directly, with no shell between.
 */
import { Duration, Effect, Stream } from "effect";
import { ChildProcess, type ChildProcessSpawner } from "effect/process";

import { type ChangedFile, CommitError, type PushTarget } from "./contract.ts";

/** Reads that stay on this machine. */
const LOCAL_TIMEOUT = Duration.seconds(30);

/** Commits and pushes run hooks, which can run a project's checks. */
const WRITE_TIMEOUT = Duration.minutes(10);

/** Files diffed at once. */
const DIFF_CONCURRENCY = 8;

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

const text = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Stream.mkString(Stream.decodeText(stream));

/** Git's own words when it gave any, else which command failed. */
const failureOf = (command: string, output: string) => {
  const lines = output.split("\n").flatMap((line) => (line.trim() === "" ? [] : [line.trim()]));
  const line = lines.find((each) => /^(fatal|error):/u.test(each)) ?? lines.join("\n");

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
const parseStatus = (output: string): ReadonlyArray<ChangedFile> => {
  const records = output.split("\0");
  const files: ChangedFile[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? "";
    const type = record.slice(0, 1);
    const fields = FIELDS_BEFORE_PATH.get(type);
    const path = fields === undefined ? "" : record.split(" ").slice(fields).join(" ");
    const previousPath = type === "2" ? records[index + 1] : undefined;

    if (fields !== undefined && previousPath === undefined) {
      files.push({ path, status: statusOf(type, record.slice(2, 4)) });
    } else if (fields !== undefined && previousPath !== undefined) {
      index += 1;
      files.push({ path, previousPath, status: "renamed" });
    }
  }

  return files;
};

interface Exited {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Git through the spawner: `exec` gives any exit, `ok` fails unless git exits with 0. */
const makeRun = (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) => {
  const exec = (root: string, args: ReadonlyArray<string>, timeout = LOCAL_TIMEOUT) =>
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make("git", args, { cwd: root, env: ENV, extendEnv: true, stdin: "ignore" }),
      );

      const [stdout, stderr, code] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: "unbounded" },
      );

      const exited: Exited = { code, stdout, stderr };

      return exited;
    }).pipe(
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () =>
          Effect.fail(new CommitError({ message: `git ${args[0] ?? ""} took too long.` })),
      }),
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(new CommitError({ message: `git could not run: ${error.message}` })),
      ),
    );

  const ok = (root: string, args: ReadonlyArray<string>, timeout = LOCAL_TIMEOUT) =>
    Effect.flatMap(exec(root, args, timeout), ({ code, stdout, stderr }) =>
      code === 0
        ? Effect.succeed(stdout)
        : Effect.fail(failureOf(args[0] ?? "", `${stderr}\n${stdout}`)),
    );

  /** What diffs compare with: HEAD, or the empty tree before the first commit. */
  const base = (root: string) =>
    Effect.map(exec(root, ["rev-parse", "--verify", "--quiet", "HEAD"]), ({ code }) =>
      code === 0 ? "HEAD" : EMPTY_TREE,
    );

  return { exec, ok, base };
};

type Run = ReturnType<typeof makeRun>;

/** One file's diff against `from`; an untracked file shows as new. */
const diffOf = (run: Run, root: string, from: string) => (file: ChangedFile) =>
  file.status === "untracked"
    ? Effect.map(
        run.exec(root, ["diff", "--no-color", "--no-index", "--", "/dev/null", file.path]),
        ({ stdout }) => stdout,
      )
    : run.ok(root, [
        "diff",
        "--no-color",
        "--no-ext-diff",
        from,
        "--",
        ...(file.previousPath === undefined ? [file.path] : [file.previousPath, file.path]),
      ]);

/** Where the repository is and what changed in it. */
const makeReads = (run: Run) => ({
  /** The top folder of the repository holding `folder`. */
  rootOf: (folder: string) =>
    run.exec(folder, ["rev-parse", "--show-toplevel"]).pipe(
      Effect.filterOrFail(
        ({ code }) => code === 0,
        () => new CommitError({ message: "The workspace is not in a git repository." }),
      ),
      Effect.map(({ stdout }) => stdout.trim()),
    ),

  /** Every changed file, untracked ones included. */
  changedFiles: (root: string) =>
    Effect.map(
      run.ok(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]),
      parseStatus,
    ),

  /** Each changed file's diff, in the order of `files`. */
  fileDiffs: (root: string, files: ReadonlyArray<ChangedFile>) =>
    Effect.flatMap(run.base(root), (from) =>
      Effect.forEach(files, diffOf(run, root, from), { concurrency: DIFF_CONCURRENCY }),
    ),

  /** The latest `count` subjects, the latest first; none before the first commit. */
  recentSubjects: (root: string, count: number) =>
    Effect.map(run.exec(root, ["log", `-${count}`, "--format=%s"]), ({ code, stdout }) =>
      code === 0 ? stdout.split("\n").filter((line) => line !== "") : [],
    ),
});

/** The branch's upstream, else `origin/<branch>` as new; null when no branch is checked out. */
const pushTargetOf = (run: Run) =>
  Effect.fn("commit.pushTarget")(function* (root: string) {
    const upstream = yield* run.exec(root, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);

    if (upstream.code === 0) {
      const target: PushTarget = { name: upstream.stdout.trim(), branch: "", isNew: false };

      return target;
    }

    const branch = (yield* run.ok(root, ["branch", "--show-current"])).trim();
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

export const makeGit = (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) => {
  const run = makeRun(spawner);

  return { ...makeReads(run), ...makeWrites(run) };
};
