/**
 * The line under the composer's input: the model in the accent color with its thinking option, then
 * the session's approval mode, `full` in the warning color. A custom prompt keeps it, so the mode
 * stays in view while the user decides.
 */

import type { RoleColor } from "@liminal/sdk/tui";

/** How the session's tool calls are approved. */
export type ApprovalMode = "auto" | "ask" | "full";

export function ModelLine(props: {
  readonly color: RoleColor;
  readonly model: string;
  readonly thinking: string;
  readonly approval: ApprovalMode;
  /** Whether a blank row separates the line from what is above it. */
  readonly isSpaced: boolean;
}) {
  return (
    <box flexDirection="row" gap={2} marginTop={props.isSpaced ? 1 : 0}>
      <text wrapMode="none">
        <span style={{ fg: props.color("text.accent") }}>{props.model}</span>
        <span style={{ fg: props.color("text.muted") }}>{` (${props.thinking})`}</span>
      </text>
      <text wrapMode="none">
        <span style={{ fg: props.color("text.faint") }}>{"approval "}</span>
        <span
          style={{ fg: props.color(props.approval === "full" ? "feedback.warning" : "text.muted") }}
        >
          {props.approval}
        </span>
      </text>
    </box>
  );
}
