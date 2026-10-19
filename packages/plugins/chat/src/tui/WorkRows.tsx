/**
 * A run of tool calls as quiet rows: a mark, the verb in bold, what it worked on, and fainter
 * detail in brackets; a failure shows in the danger color. A click opens a row: a joined row lists
 * its calls, and a single call shows its tool's detail. Calls a `run` script made sit under its
 * row.
 */

import { Option, Schema } from "effect";
import { createSignal, For, Index, Show } from "solid-js";

import type { SessionId } from "@liminal/sdk";
import { type RoleColor, SlotView, useColor, useSlotMeta } from "@liminal/sdk/tui";

import { ChatSlots, type ToolCall } from "../contract.ts";
import { groupsOf, type WorkGroup, type Worded } from "./work.ts";

const OPENED_INDENT = 2;

const decodeText = Schema.decodeUnknownOption(Schema.String);

const after = (text: string) => (text === "" ? "" : ` ${text}`);

const aside = (text: string) => (text === "" ? "" : ` (${text})`);

function Words(props: {
  readonly color: RoleColor;
  readonly mark: string;
  readonly words: Worded;
}) {
  return (
    <text>
      <span style={{ fg: props.color("text.ghost") }}>{`${props.mark} `}</span>
      <b style={{ fg: props.color("text.muted") }}>{props.words.verb}</b>
      <span style={{ fg: props.color("text.faint") }}>{after(props.words.subject)}</span>
      <span style={{ fg: props.color("text.ghost") }}>{aside(props.words.detail)}</span>
      <span style={{ fg: props.color("feedback.danger") }}>{aside(props.words.failure)}</span>
    </text>
  );
}

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

function GroupRow(props: { readonly sessionId: SessionId; readonly group: WorkGroup }) {
  const color = useColor();
  const [isOpen, setIsOpen] = createSignal(false);
  const isJoined = () => props.group.calls.length > 1;
  const inner = () => (isJoined() ? [] : (props.group.calls[0]?.call.inner ?? []));

  return (
    <box flexDirection="column" onMouseUp={() => setIsOpen((was) => !was)}>
      <Words color={color} mark={isJoined() ? "◈" : "◆"} words={props.group.words} />
      <Show when={inner().length > 0}>
        <box paddingLeft={OPENED_INDENT}>
          <WorkRows sessionId={props.sessionId} calls={inner()} />
        </box>
      </Show>
      <Show when={isOpen()}>
        <box flexDirection="column" paddingLeft={OPENED_INDENT}>
          <Show
            when={isJoined()}
            fallback={
              <For each={props.group.calls}>
                {({ call }) => <Detail sessionId={props.sessionId} call={call} />}
              </For>
            }
          >
            <For each={props.group.calls}>
              {({ words }) => <Words color={color} mark="◆" words={words} />}
            </For>
          </Show>
        </box>
      </Show>
    </box>
  );
}

export function WorkRows(props: {
  readonly sessionId: SessionId;
  readonly calls: ReadonlyArray<ToolCall>;
}) {
  const rowsOf = useSlotMeta(ChatSlots.tool);
  const groups = () => groupsOf(props.calls, rowsOf);

  // A run of only hidden calls draws nothing, so it leaves no gap in the transcript.
  return (
    <Show when={groups().length > 0}>
      <box flexDirection="column">
        <Index each={groups()}>
          {(group) => <GroupRow sessionId={props.sessionId} group={group()} />}
        </Index>
      </box>
    </Show>
  );
}
