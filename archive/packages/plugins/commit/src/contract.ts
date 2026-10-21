/**
 * Commit: `/commit` turns every changed file of the workspace's repository into conventional
 * commits. The server runs one step per command; the TUI runs them in order and asks before
 * committing and before pushing.
 */

import { Effect, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { SessionId } from "@liminal/sdk";

/** A changed file, from the repository root; a renamed one names the path it had. */
export const ChangedFile = Schema.Struct({
  path: Schema.String,
  previousPath: Schema.optionalKey(Schema.String),
  status: Schema.Literals(["added", "modified", "deleted", "renamed", "untracked", "conflicted"]),
});

export type ChangedFile = typeof ChangedFile.Type;

/** Whether `/commit` asks before pushing, always pushes, or never does. */
export const PushSetting = Schema.Literals(["ask", "always", "never"]);

export type PushSetting = typeof PushSetting.Type;

/** The `commit` section of `settings.json`. */
export const CommitSettings = Schema.Struct({
  push: PushSetting.pipe(Schema.withDecodingDefaultKey(Effect.succeed<PushSetting>("ask"))),
});

export type CommitSettings = typeof CommitSettings.Type;

/**
 * The repository and its changed files when `/commit` started; `checks` counts the due checks and
 * `push` is the setting for what follows the commits.
 */
export const CommitStart = Schema.Struct({
  root: Schema.String,
  files: Schema.Array(ChangedFile),
  checks: Schema.Int,
  push: PushSetting,
  /** The model that plans, as `provider/id`. */
  planner: Schema.String,
});

export type CommitStart = typeof CommitStart.Type;

/** One commit of the plan: its whole message and its files. */
export const PlannedCommit = Schema.Struct({
  message: Schema.String,
  files: Schema.Array(ChangedFile),
});

export type PlannedCommit = typeof PlannedCommit.Type;

/** `Failed` has gone to the session as a message; `Changed` means a check changed files. */
export const ChecksPassed = Schema.TaggedStruct("Passed", {});

export const ChecksFailed = Schema.TaggedStruct("Failed", { names: Schema.Array(Schema.String) });

export const ChecksChanged = Schema.TaggedStruct("Changed", {});

export const CheckOutcome = Schema.Union([ChecksPassed, ChecksFailed, ChecksChanged]);

export type CheckOutcome = typeof CheckOutcome.Type;

/** What `commit/apply` streams: each commit as it starts, then the short hashes. */
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

/** Commit's commands for frontends. */
export class CommitRpcs extends RpcGroup.make(
  /** The repository holding the workspace and its changed files. */
  Rpc.make("commit/start", {
    payload: { session: SessionId },
    success: CommitStart,
    error: CommitError,
  }),
  /** Runs the due checks; failures go to the session as a follow-up. */
  Rpc.make("commit/check", {
    payload: { session: SessionId, start: CommitStart },
    success: CheckOutcome,
    error: CommitError,
  }),
  /** The planner groups the files into commits; `instruction` is the text after `/commit`. */
  Rpc.make("commit/plan", {
    payload: { session: SessionId, start: CommitStart, instruction: Schema.String },
    success: Schema.Array(PlannedCommit),
    error: CommitError,
  }),
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
