/**
 * A run of thoughts and tool calls as quiet rows: a mark, the verb in bold, what it worked on, and
 * fainter detail in brackets; a failure shows in the danger color. A click opens a row: a joined
 * row lists its calls, a single call shows its tool's detail, and a thought shows its text. Calls a
 * `run` script made sit under its row. Rows fade from their current colors to dim ones once the
 * work is left behind.
 */

import { TextAttributes } from "@opentui/core";
import { Option, Schema } from "effect";
import { createSignal, For, Index, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { SlotView, useColor, useSlotMeta, workColor, WorkWords } from "@liminal/sdk/tui";

import { ChatSlots, type ToolCall } from "../contract.ts";
import type { Step } from "./transcript-state.ts";
import { groupsOf, type WorkGroup } from "./work.ts";

const OPENED_INDENT = 2;

const stepsOf = (calls: ReadonlyArray<ToolCall>): ReadonlyArray<Step> =>
  calls.map((call) => ({ kind: "call", call }));

const decodeText = Schema.decodeUnknownOption(Schema.String);

function Detail(props: { readonly sessionId: SessionId; readonly call: ToolCall }) {
  return (
    <SlotView
      of={ChatSlots.tool}
      cell={props.call.name}
      props={{
        sessionId: props.sessionId,
        call: props.call,
        text: Option.getOrElse(decodeText(props.call.outcome?.result), () => ""),
      }}
    />
  );
}

/** What a row shows once opened: its calls' rows, its call's detail, or its whole thought. */
function Opened(props: {
  readonly sessionId: SessionId;
  readonly group: WorkGroup;
  readonly dim: number;
}) {
  const color = useColor();
  const calls = () => (props.group.kind === "calls" ? props.group.calls : []);
  const thought = () => (props.group.kind === "thought" ? props.group.text : undefined);

  return (
    <box flexDirection="column" paddingLeft={OPENED_INDENT}>
      <Show when={thought()}>
        {(text) => (
          <text fg={workColor(color, "thought", props.dim)} attributes={TextAttributes.ITALIC}>
            {text()}
          </text>
        )}
      </Show>
      <Show
        when={calls().length > 1}
        fallback={
          <For each={calls()}>
            {({ call }) => <Detail sessionId={props.sessionId} call={call} />}
          </For>
        }
      >
        <For each={calls()}>
          {({ words }) => <WorkWords color={color} mark="◆" words={words} dim={props.dim} />}
        </For>
      </Show>
    </box>
  );
}

/** Calls a single call ran inside it, such as a `run` script's. */
const innerOf = (group: WorkGroup): ReadonlyArray<ToolCall> =>
  group.kind === "calls" && group.calls.length === 1 ? (group.calls[0]?.call.inner ?? []) : [];

const markOf = (group: WorkGroup) => (group.kind === "calls" && group.calls.length > 1 ? "◈" : "◆");

function GroupRow(props: {
  readonly sessionId: SessionId;
  readonly group: WorkGroup;
  readonly dim: number;
}) {
  const color = useColor();
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <box flexDirection="column" onMouseUp={() => setIsOpen((was) => !was)}>
      <WorkWords
        color={color}
        mark={markOf(props.group)}
        words={props.group.words}
        dim={props.dim}
      />
      <Show when={innerOf(props.group).length > 0}>
        <box paddingLeft={OPENED_INDENT}>
          <WorkRows
            sessionId={props.sessionId}
            steps={stepsOf(innerOf(props.group))}
            dim={props.dim}
          />
        </box>
      </Show>
      <Show when={isOpen()}>
        <Opened sessionId={props.sessionId} group={props.group} dim={props.dim} />
      </Show>
    </box>
  );
}

export function WorkRows(props: {
  readonly sessionId: SessionId;
  readonly steps: ReadonlyArray<Step>;
  /** How far the work has dimmed, from 0 to 1. */
  readonly dim: number;
}) {
  const rowsOf = useSlotMeta(ChatSlots.tool);
  const groups = () => groupsOf(props.steps, rowsOf);

  // A run of only hidden calls draws nothing, so it leaves no gap in the transcript.
  return (
    <Show when={groups().length > 0}>
      <box flexDirection="column">
        <Index each={groups()}>
          {(group) => <GroupRow sessionId={props.sessionId} group={group()} dim={props.dim} />}
        </Index>
      </box>
    </Show>
  );
}
