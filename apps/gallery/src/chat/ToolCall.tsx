/**
 * One tool call in the conversation: a status glyph, the tool name, its main parameter, and
 * optionally collapsed output and an error.
 */

import { For, Show } from "solid-js";

import type { RoleColor, RoleName } from "../tokens/roles.ts";
import { Chip } from "./Chip.tsx";

export type ToolStatus = "pending" | "success" | "error";

const STATUS: Readonly<Record<ToolStatus, { readonly glyph: string; readonly role: RoleName }>> = {
  pending: { glyph: "●", role: "feedback.success.subtle" },
  success: { glyph: "✓", role: "feedback.success" },
  error: { glyph: "×", role: "feedback.danger" },
};

export type ToolOutput = { readonly lines: readonly string[]; readonly hidden: number };

type Props = {
  readonly color: RoleColor;
  readonly status: ToolStatus;
  readonly name: string;
  readonly param: string;
  readonly output?: ToolOutput;
  readonly error?: string;
};

/** Collapsed output, pushed back by a fill that spans the width. */
function Output(props: { readonly color: RoleColor; readonly output: ToolOutput }) {
  return (
    <box flexDirection="column" backgroundColor={props.color("surface.raised")} paddingX={1}>
      <For each={props.output.lines}>
        {(line) => (
          <text wrapMode="none" truncate fg={props.color("text.faint")}>
            {line}
          </text>
        )}
      </For>
      <text wrapMode="none" fg={props.color("text.ghost")}>
        {`… ${props.output.hidden} more lines`}
      </text>
    </box>
  );
}

export function ToolCall(props: Props) {
  const status = () => STATUS[props.status];

  return (
    <box flexDirection="column">
      <box flexDirection="row" height={1}>
        <text wrapMode="none" flexShrink={0}>
          <span style={{ fg: props.color(status().role) }}>{status().glyph}</span>
          <span style={{ fg: props.color("feedback.info") }}>{` ${props.name} `}</span>
        </text>
        <text wrapMode="none" truncate flexShrink={1} fg={props.color("text.muted")}>
          {props.param}
        </text>
      </box>
      <Show when={props.output}>
        {(output) => <Output color={props.color} output={output()} />}
      </Show>
      <Show when={props.error}>
        {(error) => (
          <text wrapMode="none">
            <Chip color={props.color} label="ERROR" fill="fill.danger" />
            <span style={{ fg: props.color("text.muted") }}>{` ${error()}`}</span>
          </text>
        )}
      </Show>
    </box>
  );
}
