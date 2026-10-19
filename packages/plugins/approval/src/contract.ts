/** Approval: the session approval modes, the asks waiting for the user, and the saved answers. */

import { Context, Effect, Schema, type Stream } from "effect";
import { Rpc, RpcGroup } from "effect/rpc";

import { defineEntry, SessionId } from "@liminal/sdk";

/**
 * How asks are answered: `auto` tries a decision model and a reviewer before the user; `ask` sends
 * every ask to the user; `full` allows every call without asking.
 */
export const ApprovalMode = Schema.Literals(["auto", "ask", "full"]);

export type ApprovalMode = typeof ApprovalMode.Type;

/** The order `shift+tab` cycles through. */
export const approvalModes: ReadonlyArray<ApprovalMode> = ["auto", "ask", "full"];

/** Which decision model family `auto` tries first; `off` skips the decision model. */
export const DecisionModelSetting = Schema.Literals(["auto", "jev", "luna", "off"]);

export type DecisionModelSetting = typeof DecisionModelSetting.Type;

const commandList = Schema.Array(Schema.String).pipe(
  Schema.withDecodingDefaultKey(Effect.succeed([])),
);

/** The `approval` section of `settings.json`. */
export const ApprovalSettings = Schema.Struct({
  mode: ApprovalMode.pipe(Schema.withDecodingDefaultKey(Effect.succeed<ApprovalMode>("auto"))),
  decisionModel: DecisionModelSetting.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed<DecisionModelSetting>("auto")),
  ),
  /** Command prefixes added to the safe list. */
  safeCommands: commandList,
  /** Command prefixes that always go to the user, even in `auto`. */
  askCommands: commandList,
});

export type ApprovalSettings = typeof ApprovalSettings.Type;

/** A call waiting for the user's answer; `summary` is the reviewer's, when it wrote one. */
export const PendingAsk = Schema.Struct({
  id: Schema.String,
  sessionId: SessionId,
  callId: Schema.String,
  tool: Schema.String,
  params: Schema.Json,
  reason: Schema.String,
  summary: Schema.optionalKey(Schema.String),
});

export type PendingAsk = typeof PendingAsk.Type;

/** Who answered an ask. */
export const Answerer = Schema.Literals(["mode", "decision-model", "reviewer", "user"]);

export type Answerer = typeof Answerer.Type;

/** What the reviewer concluded about a call that then went to the user. */
export const ReviewVerdict = Schema.Struct({ risk: Schema.String, reason: Schema.String });

/**
 * One answered ask; `model` names the decision model or reviewer that answered. When the user
 * answers, `reviewed` keeps the reviewer's verdict, so a needless ask can be traced to its reason.
 */
export const ApprovalRecord = Schema.Struct({
  callId: Schema.String,
  tool: Schema.String,
  by: Answerer,
  approved: Schema.Boolean,
  reason: Schema.String,
  model: Schema.optionalKey(Schema.String),
  summary: Schema.optionalKey(Schema.String),
  reviewed: Schema.optionalKey(ReviewVerdict),
  /** Why the review gave no verdict, when it failed. */
  reviewFailed: Schema.optionalKey(Schema.String),
});

export type ApprovalRecord = typeof ApprovalRecord.Type;

/** Saved for every answered ask; the model never sees it and only the debug view shows it. */
export const ApprovalEntry = defineEntry({
  kind: "approval/answer",
  data: ApprovalRecord,
  model: false,
  user: "debug",
});

export class Approval extends Context.Service<
  Approval,
  {
    /** The session's asks waiting for the user, oldest first, then after each change. */
    readonly pending: (session: SessionId) => Stream.Stream<ReadonlyArray<PendingAsk>>;
    /** Answers the ask `id`; `note` tells the model why a call was rejected. Unknown ids do nothing. */
    readonly answer: (id: string, approve: boolean, note: string) => Effect.Effect<void>;
    /** The session's mode: its own once set, else the settings' mode; then after each change. */
    readonly mode: (session: SessionId) => Stream.Stream<ApprovalMode>;
    /** Sets the session's mode until the server stops; settings are not written. */
    readonly setMode: (session: SessionId, mode: ApprovalMode) => Effect.Effect<void>;
  }
>()("liminal/approval/Approval") {}

export class ApprovalRpcs extends RpcGroup.make(
  Rpc.make("approval/pending", {
    payload: { session: SessionId },
    success: Schema.Array(PendingAsk),
    stream: true,
  }),
  Rpc.make("approval/answer", {
    payload: { id: Schema.String, approve: Schema.Boolean, note: Schema.String },
  }),
  Rpc.make("approval/mode", {
    payload: { session: SessionId },
    success: ApprovalMode,
    stream: true,
  }),
  Rpc.make("approval/set-mode", { payload: { session: SessionId, mode: ApprovalMode } }),
) {}
