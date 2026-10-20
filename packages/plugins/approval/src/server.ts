/**
 * Approval's server: registers the check that asks and the approver that answers, and serves the
 * session modes and pending asks to frontends.
 */

import { Effect, Layer, Path } from "effect";

import { CommandRunner } from "@liminal/command-runner/contract";
import { Decisions } from "@liminal/decisions/contract";
import { WorkspaceFiles } from "@liminal/files/contract";
import { Models, ModelTask } from "@liminal/models/contract";
import { Directories } from "@liminal/sdk";
import { EntryKinds, SessionLog } from "@liminal/session-log/contract";
import { Settings } from "@liminal/settings/contract";
import { ShellSafety } from "@liminal/shell-safety/contract";
import { Approvers, ToolChecks } from "@liminal/tools/contract";

import { Approval, ApprovalEntry, ApprovalRpcs, ModeEntry } from "./contract.ts";
import { makeApprover } from "./server/chain.ts";
import { approvalCheck } from "./server/checks.ts";
import { makeModes } from "./server/modes.ts";
import { makePending } from "./server/pending.ts";

/** Runs after checks registered before it, such as a plugin's own deny rules. */
const checkOrder = 100;

const make = Effect.gen(function* () {
  const { workspace } = yield* Directories;
  const safety = yield* ShellSafety;
  const files = yield* WorkspaceFiles;
  const log = yield* SessionLog;
  const modes = yield* makeModes(yield* Settings, log);
  const pending = yield* makePending;

  const kinds = yield* EntryKinds;
  yield* kinds.register(ApprovalEntry);
  yield* kinds.register(ModeEntry);

  yield* (yield* ToolChecks).register(
    approvalCheck({ modes, safety, files, path: yield* Path.Path, workspace }),
    { order: checkOrder },
  );

  const approver = makeApprover({
    modes,
    safety,
    pending,
    log,
    decisions: yield* Effect.serviceOption(Decisions),
    reviewer: {
      models: yield* Models,
      task: yield* ModelTask,
      runner: yield* CommandRunner,
      files,
      safety,
      workspace,
    },
  });

  yield* (yield* Approvers).register(approver, { order: 0 });

  return Approval.of({
    pending: pending.list,
    answer: pending.answer,
    mode: modes.watch,
    setMode: modes.set,
  });
});

const rpcs = ApprovalRpcs.toLayer(
  Effect.gen(function* () {
    const approval = yield* Approval;

    return ApprovalRpcs.of({
      "approval/pending": ({ session }) => approval.pending(session),
      "approval/answer": ({ id, approve, note }) => approval.answer(id, approve, note),
      "approval/mode": ({ session }) => approval.mode(session),
      "approval/set-mode": ({ session, mode }) => approval.setMode(session, mode),
    });
  }),
);

export const layer = rpcs.pipe(Layer.provideMerge(Layer.effect(Approval, make)));
