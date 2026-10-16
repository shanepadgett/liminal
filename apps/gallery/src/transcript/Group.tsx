/**
 * Neighboring tool calls folded into one line under the group's label, such as `Explored`. Open, it
 * lists each call on its own line beneath.
 */

import { For, Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import type { ToolCall as Call } from "./entries.ts";
import type { DrawnLevel, GroupRule } from "./levels.ts";
import { faceOf } from "./results/faceOf.ts";
import { BODY_INDENT } from "./results/Panel.tsx";
import { combinedStatus } from "./status.ts";
import { StatusLabel } from "./StatusLabel.tsx";
import { ToolCall } from "./ToolCall.tsx";

export function Group(props: {
  readonly color: RoleColor;
  readonly rule: GroupRule;
  readonly calls: readonly Call[];
  readonly level: DrawnLevel;
  readonly isOpen: boolean;
}) {
  const status = () => combinedStatus(props.calls.map((call) => call.outcome.status));
  const subjects = () => props.calls.map((call) => faceOf(call).subject).join(", ");
  const showsCalls = () => props.level === "full" || (props.level === "line" && props.isOpen);

  return (
    <box flexDirection="column">
      <box flexDirection="row" height={1} gap={1}>
        <StatusLabel color={props.color} status={status()} label={props.rule.label} />
        <text wrapMode="none" truncate flexShrink={1} fg={props.color("text.muted")}>
          {subjects()}
        </text>
      </box>
      <Show when={showsCalls()}>
        <box flexDirection="column" marginLeft={BODY_INDENT}>
          <For each={props.calls}>
            {(call) => <ToolCall color={props.color} call={call} level="line" isOpen={false} />}
          </For>
        </box>
      </Show>
    </box>
  );
}
