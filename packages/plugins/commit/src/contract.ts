/**
 * Commit: `/commit` turns every changed file of the repository holding the workspace into
 * conventional commits. The server runs one step per RPC; the TUI runs them in order and asks
 * before committing and before pushing.
 */
import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { Setting } from "@shanepadgett/liminal-settings/contract";

/** How git sees a changed file. */
export const FileStatus = Schema.Literals([
  "added",
  "modified",
  "deleted",
  "renamed",
  "untracked",
  "conflicted",
]);

export type FileStatus = typeof FileStatus.Type;

/** A changed file, from the repository root; a renamed one names the path it had. */
export const ChangedFile = Schema.Struct({
  status: FileStatus,
  path: Schema.String,
  previousPath: Schema.optionalKey(Schema.String),
});

export type ChangedFile = typeof ChangedFile.Type;

/** Whether `/commit` asks before pushing, always pushes, or never does. */
export const PushSetting = Schema.Literals(["ask", "always", "never"]);

export type PushSetting = typeof PushSetting.Type;

/** The `commit` key of `settings.json`; `push` is `ask` unless set. */
export const CommitSetting = Setting.make(
  "commit",
  Schema.Struct({
    push: PushSetting.pipe(Schema.withDecodingDefaultKey(Effect.succeed<PushSetting>("ask"))),
  }),
);

/** The repository and its changed files when `/commit` started, and what follows the commits. */
export const CommitStart = Schema.Struct({
  root: Schema.String,
  files: Schema.Array(ChangedFile),
  push: PushSetting,
  /** The model that plans, as its id. */
  planner: Schema.String,
});

export type CommitStart = typeof CommitStart.Type;

/** One commit of the plan: its whole message and its files. */
export const PlannedCommit = Schema.Struct({
  message: Schema.String,
  files: Schema.Array(ChangedFile),
});

export type PlannedCommit = typeof PlannedCommit.Type;

/** What `commit/apply` streams: each commit as it starts, then the short hashes of them all. */
export const Committing = Schema.TaggedStruct("Committing", { index: Schema.Int });

export const Committed = Schema.TaggedStruct("Committed", { hashes: Schema.Array(Schema.String) });

export const CommitProgress = Schema.Union([Committing, Committed]);

export type CommitProgress = typeof CommitProgress.Type;

/** Where a push goes, such as `origin/main`; `isNew` when the branch has no upstream yet. */
export const PushTarget = Schema.Struct({
  name: Schema.String,
  branch: Schema.String,
  isNew: Schema.Boolean,
});

export type PushTarget = typeof PushTarget.Type;

/** A step could not run; `message` says why, for the user. */
export class CommitError extends Schema.TaggedError<
  CommitError,
  { readonly brand: unique symbol }
>()("CommitError", { message: Schema.String }) {}

/** A commit failed after `hashes` were made. */
export class CommitFailed extends Schema.TaggedError<
  CommitFailed,
  { readonly brand: unique symbol }
>()("CommitFailed", { hashes: Schema.Array(Schema.String), message: Schema.String }) {}

const root = { root: Schema.String };

export class CommitRpc extends RpcGroup.make(
  /** The repository holding the workspace, its changed files and the push setting. */
  Rpc.make("commit/start", { success: CommitStart, error: CommitError }),
  /** The small model groups the files into commits; `instruction` is the text after `/commit`. */
  Rpc.make("commit/plan", {
    payload: { start: CommitStart, instruction: Schema.String },
    success: Schema.Array(PlannedCommit),
    error: CommitError,
  }),
  /** Makes each commit in order. */
  Rpc.make("commit/apply", {
    payload: { ...root, commits: Schema.Array(PlannedCommit) },
    success: CommitProgress,
    error: CommitFailed,
    stream: true,
  }),
  /** The branch's upstream, or `origin/<branch>` when it has none; null with no branch. */
  Rpc.make("commit/push-target", {
    payload: root,
    success: Schema.NullOr(PushTarget),
    error: CommitError,
  }),
  Rpc.make("commit/push", { payload: { ...root, target: PushTarget }, error: CommitError }),
) {}

/** `1 commit`, `3 commits`. */
export const commitsText = (count: number) => (count === 1 ? "1 commit" : `${count} commits`);
