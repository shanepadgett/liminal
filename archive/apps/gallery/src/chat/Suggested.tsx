/** The answer the assistant suggests for a question, and why, set quietly under the question. */

import type { Recommendation } from "@liminal/questions/contract";
import type { RoleColor } from "@liminal/sdk/tui";

const LABEL = "suggested  ";

export function Suggested(props: {
  readonly color: RoleColor;
  readonly recommendation: Recommendation;
}) {
  return (
    <box flexDirection="row">
      <text wrapMode="none" flexShrink={0} fg={props.color("text.ghost")}>
        {LABEL}
      </text>
      <box flexDirection="column" flexShrink={1}>
        <text fg={props.color("text.accent")}>{props.recommendation.answer}</text>
        <text fg={props.color("text.faint")}>{props.recommendation.reason}</text>
      </box>
    </box>
  );
}
