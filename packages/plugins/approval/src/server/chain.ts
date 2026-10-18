/**
 * How an ask is answered: in `auto`, the decision model, then the reviewer, then the user; in
 * `ask`, or for a command in `askCommands`, the reviewer's summary and then the user. Each answer
 * is saved.
 */

import { Effect, Option } from "effect";

import type { Decisions } from "@liminal/decisions/contract";
import { draft } from "@liminal/sdk";
import type { SessionLog } from "@liminal/session-log/contract";
import type { ShellSafety } from "@liminal/shell-safety/contract";
import { ApprovalAnswer, type Approver, type ToolCall } from "@liminal/tools/contract";

import { ApprovalEntry, type ApprovalRecord, type PendingAsk } from "../contract.ts";
import { commandOf } from "./checks.ts";
import { classify } from "./classify.ts";
import type { Modes } from "./modes.ts";
import type { Pending } from "./pending.ts";
import { recentOf } from "./recent.ts";
import { review, type ReviewDeps } from "./review.ts";

export interface ChainDeps {
  readonly modes: Modes;
  readonly log: SessionLog["Service"];
  readonly safety: ShellSafety["Service"];
  readonly decisions: Option.Option<Decisions["Service"]>;
  readonly reviewer: ReviewDeps;
  readonly pending: Pending;
}

const textOf = (record: ApprovalRecord) =>
  `${record.approved ? "Approved" : "Rejected"} ${record.tool} (${record.by}): ${record.reason}`;

/** Saves the answer; a failed save is logged, since the call's answer matters more. */
const save = (deps: ChainDeps, call: ToolCall, record: ApprovalRecord) =>
  deps.log
    .append(call.sessionId, [draft(ApprovalEntry, { data: record, text: textOf(record) })])
    .pipe(
      Effect.tapError((error) => Effect.logWarning(`approval answer not saved: ${error.message}`)),
      Effect.ignore,
    );

const allowedBy = (
  deps: ChainDeps,
  call: ToolCall,
  fields: Pick<ApprovalRecord, "by" | "reason" | "model" | "summary">,
) =>
  Effect.as(
    save(deps, call, { callId: call.callId, tool: call.name, approved: true, ...fields }),
    ApprovalAnswer.Allow(),
  );

/** Whether the ask skips the models' approval and goes to the user. */
const forced = Effect.fn("approval.forced")(function* (deps: ChainDeps, call: ToolCall) {
  if ((yield* deps.modes.get(call.sessionId)) === "ask") return true;
  const { askCommands } = yield* deps.modes.settings;

  return Option.exists(commandOf(call), (command) => deps.safety.matchesAny(command, askCommands));
});

const askUser = Effect.fn("approval.askUser")(function* (
  deps: ChainDeps,
  call: ToolCall,
  reason: string,
  summary: Option.Option<string>,
) {
  const ask: PendingAsk = {
    id: `${call.sessionId}/${call.callId}`,
    sessionId: call.sessionId,
    callId: call.callId,
    tool: call.name,
    params: call.params,
    reason,
  };

  const answer = yield* deps.pending.ask(
    Option.match(summary, { onNone: () => ask, onSome: (text) => ({ ...ask, summary: text }) }),
  );

  const approved = ApprovalAnswer.$is("Allow")(answer);
  const said = ApprovalAnswer.$is("Deny")(answer) ? answer.reason : "the user approved the call";

  yield* save(deps, call, {
    callId: call.callId,
    tool: call.name,
    by: "user",
    approved,
    reason: said,
  });

  return answer;
});

export const makeApprover =
  (deps: ChainDeps): Approver =>
  (call, reason) =>
    Effect.gen(function* () {
      if ((yield* deps.modes.get(call.sessionId)) === "full")
        return yield* allowedBy(deps, call, { by: "mode", reason: "the session is in full mode" });

      const settings = yield* deps.modes.settings;
      const recent = yield* recentOf(deps.log, call.sessionId);
      const toUser = yield* forced(deps, call);

      if (!toUser) {
        const model = yield* classify(deps.decisions, settings.decisionModel, call, recent);

        if (Option.isSome(model))
          return yield* allowedBy(deps, call, { by: "decision-model", reason, model: model.value });
      }

      const reviewed = yield* review(deps.reviewer, call, reason, {
        recent,
        safeCommands: settings.safeCommands,
      });

      if (!toUser && Option.isSome(reviewed) && reviewed.value.decision === "approved")
        return yield* allowedBy(deps, call, {
          by: "reviewer",
          reason: reviewed.value.reason,
          summary: reviewed.value.summary,
        });

      return yield* askUser(
        deps,
        call,
        reason,
        Option.map(reviewed, (found) => found.summary),
      );
    });
