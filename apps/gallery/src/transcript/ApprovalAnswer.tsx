/**
 * An approval answer, shown only in the debug view: one faint line with a mark, the tool, whether
 * it was approved, who answered (and which model) and why.
 */

import type { RoleColor } from "@liminal/sdk/tui";

export type ApprovalAnswerMessage = {
  readonly tool: string;
  readonly approved: boolean;
  /** Who answered: `decision model`, `reviewer`, `mode` or `you`. */
  readonly by: string;
  readonly model?: string;
  readonly reason: string;
};

const lineOf = (answer: ApprovalAnswerMessage): string => {
  const mark = answer.approved ? "✓" : "✕";
  const verdict = answer.approved ? "approved" : "rejected";
  const model = answer.model === undefined ? "" : ` (${answer.model})`;

  return `${mark} ${answer.tool} ${verdict} by ${answer.by}${model}: ${answer.reason}`;
};

export function ApprovalAnswer(props: {
  readonly color: RoleColor;
  readonly answer: ApprovalAnswerMessage;
}) {
  return <text fg={props.color("text.faint")}>{lineOf(props.answer)}</text>;
}
