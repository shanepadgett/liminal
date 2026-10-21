/**
 * Commit's server: each `/commit` step on the repository holding the workspace. It keeps no state;
 * the TUI passes back what `commit/start` found.
 */

import { DateTime, Effect, Queue, Stream } from "effect";

import { AgentLoop } from "@liminal/agent-loop/contract";
import { CommitChecks, reportText } from "@liminal/checks/contract";
import { CommandRunner } from "@liminal/command-runner/contract";
import { Inbox } from "@liminal/inbox/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { Directories, type SessionId } from "@liminal/sdk";
import { SessionLog, UserEntry } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";

import {
  type ChangedFile,
  ChecksChanged,
  ChecksFailed,
  ChecksPassed,
  CommitError,
  CommitFailed,
  Committed,
  Committing,
  type CommitProgress,
  CommitRpcs,
  CommitSettings,
  type CommitStart,
  type PlannedCommit,
} from "./contract.ts";
import { type Git, makeGit } from "./server/git.ts";
import { planCommits } from "./server/plan.ts";

const RECENT_SUBJECTS = 12;

const CHANGED = ChecksChanged.make({});

const PASSED = ChecksPassed.make({});

const failWith = (error: { readonly message: string }) =>
  new CommitError({ message: error.message });

const statusText = (files: ReadonlyArray<ChangedFile>) =>
  files.map((file) => `${file.status} ${file.path}`).join("\n");

const failurePrompt = (report: string) =>
  `[commit checks] /commit ran the project's checks and some failed, so nothing was committed. Fix these, then I will run /commit again.\n\n${report}`;

/** The paths a commit of `files` stages, a rename's old path included. */
const pathsOf = (commit: PlannedCommit) =>
  commit.files.flatMap(({ path, previousPath }) =>
    previousPath === undefined ? [path] : [path, previousPath],
  );

/** The due checks of the changed files, and running them for `/commit`. */
const makeChecking = Effect.fn("commit.checking")(function* (git: Git) {
  const { workspace } = yield* Directories;
  const checks = yield* CommitChecks;
  const inbox = yield* Inbox;

  /** The changed files inside the workspace, as paths from it, which the checks match. */
  const workspacePaths = Effect.fn("commit.workspacePaths")(function* (
    files: ReadonlyArray<ChangedFile>,
  ) {
    const prefix = yield* git.prefixOf(workspace);

    return files.flatMap(({ path }) =>
      path.startsWith(prefix) ? [path.slice(prefix.length)] : [],
    );
  });

  const dueOf = (session: SessionId, files: ReadonlyArray<ChangedFile>) =>
    workspacePaths(files).pipe(
      Effect.flatMap((paths) => checks.due(session, paths)),
      Effect.mapError(failWith),
    );

  const check = Effect.fn("commit.check")(function* (session: SessionId, begun: CommitStart) {
    const report = yield* Effect.flatMap(dueOf(session, begun.files), (due) => due.run);
    const after = yield* git.changedFiles(begun.root);
    if (statusText(after) !== statusText(begun.files)) return CHANGED;
    if (report.failed.length === 0) return PASSED;

    const text = failurePrompt(reportText(report));
    yield* inbox.send(session, { text, pictures: [] }, "follow-up").pipe(Effect.mapError(failWith));

    return ChecksFailed.make({ names: report.failed.map(({ name }) => name) });
  });

  return { dueOf, check };
});

/** Makes each commit of the plan, streaming its progress. */
const applyCommits = (git: Git, root: string, commits: ReadonlyArray<PlannedCommit>) =>
  Stream.callback<CommitProgress, CommitFailed>((queue) =>
    Effect.gen(function* () {
      const hashes: string[] = [];

      for (const [index, commit] of commits.entries()) {
        yield* Queue.offer(queue, Committing.make({ index }));

        const hash = yield* git
          .commitFiles(root, pathsOf(commit), commit.message)
          .pipe(
            Effect.mapError(
              (error) => new CommitFailed({ hashes: [...hashes], message: error.message }),
            ),
          );

        hashes.push(hash);
      }

      yield* Queue.offer(queue, Committed.make({ hashes }));
      yield* Queue.end(queue);
    }),
  );

/** The user's prompts in the session after the repository's latest commit. */
const promptsAfterHead = (git: Git, log: SessionLog["Service"]) =>
  Effect.fn("commit.prompts")(function* (session: SessionId, root: string) {
    const since = yield* git.headTime(root);
    const entries = yield* log.read(session, {}).pipe(Effect.orElseSucceed(() => []));

    return entries.flatMap((entry) =>
      entry.kind === UserEntry.kind && DateTime.toEpochMillis(entry.at) > since ? [entry.text] : [],
    );
  });

const make = Effect.gen(function* () {
  const { workspace } = yield* Directories;
  const git = makeGit(yield* CommandRunner);
  const { dueOf, check } = yield* makeChecking(git);
  const loop = yield* AgentLoop;
  const models = yield* Models;
  const task = yield* ModelTask;
  const store = yield* Settings;
  const promptsSince = promptsAfterHead(git, yield* SessionLog);

  /** The small model of the provider a new turn would use. */
  const planner = loop.defaults.pipe(
    Effect.mapError(() => new CommitError({ message: "No model is set. Pick one with /model." })),
    Effect.flatMap((settings) => models.cheap(settings.model.provider)),
    Effect.mapError(failWith),
  );

  /** What `settings.json` says about pushing; invalid settings ask. */
  const pushSetting = store.section("commit", CommitSettings).pipe(
    Effect.map(({ push }) => push),
    Effect.catchTag("SettingsInvalid", (error) =>
      Effect.as(Effect.logWarning(`commit settings ignored: ${error.message}`), "ask" as const),
    ),
  );

  const start = Effect.fn("commit.start")(function* (session: SessionId) {
    const root = yield* git.rootOf(workspace);
    const files = yield* git.changedFiles(root);
    if (files.length === 0) return yield* new CommitError({ message: "Nothing to commit." });

    const due = yield* dueOf(session, files);
    const pick = yield* planner;

    const found: CommitStart = {
      root,
      files,
      checks: due.count,
      push: yield* pushSetting,
      planner: `${pick.model.provider}/${pick.model.id}`,
    };

    return found;
  });

  const plan = Effect.fn("commit.plan")(function* (
    session: SessionId,
    begun: CommitStart,
    instruction: string,
  ) {
    const evidence = {
      files: begun.files,
      diffs: yield* git.fileDiffs(begun.root, begun.files),
      subjects: yield* git.recentSubjects(begun.root, RECENT_SUBJECTS),
      prompts: yield* promptsSince(session, begun.root),
      instruction: instruction.trim(),
    };

    return yield* planCommits(task, { model: yield* planner, session, evidence });
  });

  return CommitRpcs.of({
    "commit/start": ({ session }) => start(session),
    "commit/check": ({ session, start: begun }) => check(session, begun),
    "commit/plan": ({ session, start: begun, instruction }) => plan(session, begun, instruction),
    "commit/apply": ({ root, commits }) => applyCommits(git, root, commits),
    "commit/push-target": ({ root }) => git.pushTarget(root),
    "commit/push": ({ root, target }) => git.push(root, target),
  });
});

export const layer = CommitRpcs.toLayer(make);
