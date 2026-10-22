import type { State } from "../../entries.ts";
import { atBottom } from "../chat/Composer.states.tsx";
import { type ApprovalCall, type ApprovalCursor, Approval, approvalHintsOf } from "./Approval.tsx";
import { SHELL_CALL } from "./samples.ts";

const approval = (call: ApprovalCall, cursor: ApprovalCursor, waiting = 0) =>
  atBottom({
    ask: () => <Approval call={call} waiting={waiting} cursor={cursor} />,
    hints: approvalHintsOf(cursor),
    isWorking: true,
  });

export const approvalStates: readonly [State, ...State[]] = [
  { name: "Shell command", fill: "screen", view: approval(SHELL_CALL, { kind: "approve" }) },
  { name: "More waiting", fill: "screen", view: approval(SHELL_CALL, { kind: "approve" }, 2) },
  { name: "On reject", fill: "screen", view: approval(SHELL_CALL, { kind: "reject", note: "" }) },
  {
    name: "Writing why",
    fill: "screen",
    view: approval(SHELL_CALL, { kind: "reject", note: "Only clear the root node_modules" }),
  },
];
