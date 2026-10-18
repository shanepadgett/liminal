/**
 * The session's transcript, scrolled to its end: each shown entry drawn by its kind's registration
 * (its plain text when none draws it), runs of tool calls as work rows, then the live state. Debug
 * entries draw only while the debug view is on, their plain text faint.
 */

import { type Accessor, Index, Match, Show, Switch } from "solid-js";

import type { SavedEntry, SessionId } from "@liminal/sdk";
import { SlotView, useColor } from "@liminal/sdk/tui";

import { ChatSlots } from "../contract.ts";
import type { Item, Transcript as TranscriptState } from "./transcript-state.ts";
import { WorkRows } from "./WorkRows.tsx";

const PADDING_X = 2;

function EntryRow(props: { readonly sessionId: SessionId; readonly entry: SavedEntry }) {
  const color = useColor();

  return (
    <SlotView
      of={ChatSlots.entry}
      cell={props.entry.kind}
      props={{ sessionId: props.sessionId, entry: props.entry }}
      fallback={
        <text fg={color(props.entry.user === "debug" ? "text.faint" : "text.base")}>
          {props.entry.text}
        </text>
      }
    />
  );
}

function ItemRow(props: {
  readonly sessionId: SessionId;
  readonly item: Item;
  readonly debug: boolean;
}) {
  const entry = () =>
    props.item.kind === "entry" && (props.debug || props.item.entry.user !== "debug")
      ? props.item.entry
      : undefined;

  const calls = () => (props.item.kind === "work" ? props.item.calls : undefined);

  return (
    <Switch>
      <Match when={entry()}>
        {(shown) => <EntryRow sessionId={props.sessionId} entry={shown()} />}
      </Match>
      <Match when={calls()}>
        {(run) => <WorkRows sessionId={props.sessionId} calls={run()} />}
      </Match>
    </Switch>
  );
}

export function Transcript(props: {
  readonly sessionId: SessionId;
  readonly transcript: Accessor<TranscriptState>;
  readonly debug: Accessor<boolean>;
}) {
  return (
    <scrollbox flexGrow={1} stickyScroll stickyStart="bottom" scrollbarOptions={{ visible: false }}>
      <box flexDirection="column" gap={1} paddingX={PADDING_X} paddingY={1}>
        <Index each={props.transcript().items}>
          {(item) => <ItemRow sessionId={props.sessionId} item={item()} debug={props.debug()} />}
        </Index>
        <Show when={props.transcript().live}>
          {(live) => (
            <SlotView
              of={ChatSlots.live}
              cell={live().kind}
              props={{ sessionId: props.sessionId, live: live() }}
            />
          )}
        </Show>
      </box>
    </scrollbox>
  );
}
