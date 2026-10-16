/**
 * Conversation messages. A user message hangs off a bar in the accent color that turns heavy when
 * focused; the assistant's reply has no chrome at all, just an indent.
 */

import type { JSX } from "@opentui/solid";

import type { RoleColor } from "../tokens/roles.ts";

export const INDENT = 2;

export function UserMessage(props: {
  readonly color: RoleColor;
  readonly isFocused: boolean;
  readonly children: string;
}) {
  return (
    <box
      border={["left"]}
      borderStyle={props.isFocused ? "heavy" : "single"}
      borderColor={props.color("border.focus")}
      paddingLeft={1}
    >
      <text fg={props.color("text.base")}>{props.children}</text>
    </box>
  );
}

/** The assistant's turn: prose and tool calls, indented to line up past the user's bar. */
export function AssistantMessage(props: { readonly children: JSX.Element }) {
  return (
    <box flexDirection="column" paddingLeft={INDENT} gap={1}>
      {props.children}
    </box>
  );
}

export function Prose(props: { readonly color: RoleColor; readonly children: string }) {
  return <text fg={props.color("text.base")}>{props.children}</text>;
}
