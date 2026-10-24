import type { JSX } from "@opentui/solid";

import type { State } from "../../entries.ts";
import { atBottom } from "../chat/Composer.states.tsx";
import { Access, Approval, type ApprovalCursor, approvalHintsOf } from "./Approval.tsx";
import { READ_OUTSIDE, SHELL_CALL, UNREVIEWED_CALL, WRITE_OUTSIDE } from "./samples.ts";

const APPROVE: ApprovalCursor = { kind: "approve" };

const REJECT: ApprovalCursor = { kind: "reject", note: "" };

const asking = (ask: () => JSX.Element, cursor: ApprovalCursor) =>
  atBottom({ ask, hints: approvalHintsOf(cursor), isWorking: true });

const call = (cursor: ApprovalCursor, waiting = 0) =>
  asking(() => <Approval call={SHELL_CALL} waiting={waiting} cursor={cursor} />, cursor);

export const approvalStates: readonly [State, ...State[]] = [
  { name: "Shell command", fill: "screen", view: call(APPROVE) },
  { name: "More waiting", fill: "screen", view: call(APPROVE, 2) },
  { name: "On reject", fill: "screen", view: call(REJECT) },
  {
    name: "Writing why",
    fill: "screen",
    view: call({ kind: "reject", note: "Only clear the root node_modules" }),
  },
  {
    name: "Review failed",
    fill: "screen",
    view: asking(() => <Approval call={UNREVIEWED_CALL} waiting={0} cursor={APPROVE} />, APPROVE),
  },
  {
    name: "Read outside",
    fill: "screen",
    view: asking(() => <Access request={READ_OUTSIDE} waiting={0} cursor={APPROVE} />, APPROVE),
  },
  {
    name: "Change outside",
    fill: "screen",
    view: asking(() => <Access request={WRITE_OUTSIDE} waiting={0} cursor={APPROVE} />, APPROVE),
  },
];
