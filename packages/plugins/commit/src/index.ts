/**
 * Commit's server: each `/commit` step on the repository holding the workspace. It keeps no state;
 * the TUI passes back what `commit/start` found.
 */
import { Effect, Layer, Queue, Stream } from "effect";
import { ChildProcessSpawner } from "effect/process";

import { definePlugin } from "@shanepadgett/liminal-core";
import { Directories } from "@shanepadgett/liminal-directories/contract";
import { type ModelId, Models } from "@shanepadgett/liminal-model/contract";
import { DeclaredSettings, Settings } from "@shanepadgett/liminal-settings/contract";

import {
  CommitError,
  CommitFailed,
  Committed,
  Committing,
  type CommitProgress,
  CommitRpc,
  CommitSetting,
  type CommitStart,
  type PlannedCommit,
  type PushSetting,
} from "./contract.ts";
import { type Git, makeGit } from "./git.ts";
import { planCommits } from "./plan.ts";

const RECENT_SUBJECTS = 12;

const ASK: PushSetting = "ask";

/** The paths a commit of `files` stages, a rename's old path included. */
const pathsOf = (commit: PlannedCommit) =>
  commit.files.flatMap(({ path, previousPath }) =>
    previousPath === undefined ? [path] : [path, previousPath],
  );

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

const make = Effect.gen(function* () {
  const { workspace } = yield* Directories;
  const git = makeGit(yield* ChildProcessSpawner.ChildProcessSpawner);
  const models = yield* Models;
  const settings = yield* Settings;

  /** What `settings.json` says about pushing; invalid settings ask. */
  const pushSetting = settings.get(CommitSetting).pipe(
    Effect.map(({ push }) => push),
    Effect.catchTag("SettingsInvalid", (error) =>
      Effect.as(Effect.logWarning(`commit settings ignored: ${error.message}`), ASK),
    ),
  );

  const plannerFor = (main: ModelId | undefined) =>
    models.resolve("small", main).pipe(
      Effect.map(({ model }) => model),
      Effect.mapError((error) => new CommitError({ message: error.message })),
    );

  const start = Effect.fn("commit.start")(function* (main: ModelId | undefined) {
    const root = yield* git.rootOf(workspace);
    const files = yield* git.changedFiles(root);
    if (files.length === 0) return yield* new CommitError({ message: "Nothing to commit." });

    const planner = yield* plannerFor(main);
    const found: CommitStart = { root, files, push: yield* pushSetting, main, planner };

    return found;
  });

  const plan = Effect.fn("commit.plan")(function* (begun: CommitStart, instruction: string) {
    const evidence = {
      files: begun.files,
      diffs: yield* git.fileDiffs(begun.root, begun.files),
      subjects: yield* git.recentSubjects(begun.root, RECENT_SUBJECTS),
      instruction: instruction.trim(),
    };

    return yield* planCommits(models, begun.main, evidence);
  });

  return CommitRpc.of({
    "commit/start": ({ main }) => start(main),
    "commit/plan": ({ start: begun, instruction }) => plan(begun, instruction),
    "commit/apply": ({ root, commits }) => applyCommits(git, root, commits),
    "commit/push-target": ({ root }) => git.pushTarget(root),
    "commit/push": ({ root, target }) => git.push(root, target),
  });
});

const declare = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* (yield* DeclaredSettings).add(CommitSetting);
  }),
);

export default definePlugin({
  name: "commit",
  provides: [],
  requires: [
    Directories,
    Models,
    Settings,
    DeclaredSettings,
    ChildProcessSpawner.ChildProcessSpawner,
  ],
  layer: Layer.mergeAll(declare, CommitRpc.toLayer(make)),
  entries: { tui: () => import("./tui/index.tsx") },
});
