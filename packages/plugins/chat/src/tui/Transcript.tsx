/**
 * The session's transcript, scrolled to its end: each shown entry drawn by its kind's registration
 * (its plain text when none draws it), runs of tool calls as work rows, then the live state. Debug
 * entries draw only while the debug view is on, their plain text faint. Once a prompt scrolls past
 * the top, a copy of it stays pinned there until the next prompt pushes it out, so the reply in
 * view always shows what it answers.
 */

import type { BoxRenderable } from "@opentui/core";
import { type Accessor, createSignal, Index, Match, onCleanup, Show, Switch } from "solid-js";

import type { SavedEntry, SessionId } from "@liminal/sdk";
import { createPin, SlotView, useColor } from "@liminal/sdk/tui";
import { UserEntry } from "@liminal/session-log/contract";

import { ChatSlots } from "../contract.ts";
import { createDim } from "./dim.ts";
import { OpenPromptsContext } from "./entries.tsx";
import {
  isLeftBehind,
  type Item,
  type Step,
  type Transcript as TranscriptState,
} from "./transcript-state.ts";
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

/** A prompt in the scrolled column, measured for the pin while it is shown. */
function PromptRow(props: {
  readonly sessionId: SessionId;
  readonly entry: SavedEntry;
  readonly index: number;
  readonly prompts: Map<number, BoxRenderable>;
}) {
  onCleanup(() => props.prompts.delete(props.index));

  return (
    <box ref={(box: BoxRenderable) => props.prompts.set(props.index, box)}>
      <EntryRow sessionId={props.sessionId} entry={props.entry} />
    </box>
  );
}

/** A run of work, dimming once it is left behind. */
function WorkItem(props: {
  readonly sessionId: SessionId;
  readonly steps: ReadonlyArray<Step>;
  readonly isLeft: boolean;
}) {
  const dim = createDim(() => props.isLeft);

  return <WorkRows sessionId={props.sessionId} steps={props.steps} dim={dim()} />;
}

function ItemRow(props: {
  readonly sessionId: SessionId;
  readonly item: Item;
  readonly index: number;
  readonly prompts: Map<number, BoxRenderable>;
  readonly debug: boolean;
  readonly isLeft: boolean;
}) {
  const entry = () =>
    props.item.kind === "entry" && (props.debug || props.item.entry.user !== "debug")
      ? props.item.entry
      : undefined;

  const prompt = () => (entry()?.kind === UserEntry.kind ? entry() : undefined);
  const steps = () => (props.item.kind === "work" ? props.item.steps : undefined);

  return (
    <Switch>
      <Match when={prompt()}>
        {(shown) => (
          <PromptRow
            sessionId={props.sessionId}
            entry={shown()}
            index={props.index}
            prompts={props.prompts}
          />
        )}
      </Match>
      <Match when={entry()}>
        {(shown) => <EntryRow sessionId={props.sessionId} entry={shown()} />}
      </Match>
      <Match when={steps()}>
        {(run) => <WorkItem sessionId={props.sessionId} steps={run()} isLeft={props.isLeft} />}
      </Match>
    </Switch>
  );
}

/**
 * The pinned prompt, drawn over the top of the scrolled column. Not keyed: moving the pin to
 * another prompt keeps the drawn prompt and only swaps its entry, so it never draws a blank frame.
 */
function Pinned(props: {
  readonly sessionId: SessionId;
  readonly entry: SavedEntry | undefined;
  readonly push: number;
}) {
  const color = useColor();

  return (
    <Show when={props.entry}>
      {(entry) => (
        <box
          position="absolute"
          top={-props.push}
          left={0}
          right={0}
          paddingX={PADDING_X}
          backgroundColor={color("surface.base")}
        >
          <EntryRow sessionId={props.sessionId} entry={entry()} />
        </box>
      )}
    </Show>
  );
}

const toggled = (seqs: ReadonlySet<number>, seq: number): ReadonlySet<number> => {
  const next = new Set(seqs);
  if (!next.delete(seq)) next.add(seq);

  return next;
};

export function Transcript(props: {
  readonly sessionId: SessionId;
  readonly transcript: Accessor<TranscriptState>;
  readonly debug: Accessor<boolean>;
}) {
  const [open, setOpen] = createSignal<ReadonlySet<number>>(new Set());
  const pin = createPin();

  const pinned = () => {
    const item = props.transcript().items[pin.pinned() ?? -1];

    return item?.kind === "entry" ? item.entry : undefined;
  };

  const openPrompts = {
    isOpen: (seq: number) => open().has(seq),
    toggle: (seq: number) => setOpen((seqs) => toggled(seqs, seq)),
  };

  return (
    <OpenPromptsContext.Provider value={openPrompts}>
      <box width="100%" height="100%" overflow="hidden" onMouseScroll={pin.onScroll}>
        <scrollbox
          ref={pin.setScroll}
          flexGrow={1}
          stickyScroll
          stickyStart="bottom"
          scrollbarOptions={{ visible: false }}
          renderBefore={pin.check}
        >
          <box flexDirection="column" gap={1} paddingX={PADDING_X} paddingY={1}>
            <Index each={props.transcript().items}>
              {(item, index) => (
                <ItemRow
                  sessionId={props.sessionId}
                  item={item()}
                  index={index}
                  prompts={pin.prompts}
                  debug={props.debug()}
                  isLeft={isLeftBehind(props.transcript(), index)}
                />
              )}
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
        <Pinned sessionId={props.sessionId} entry={pinned()} push={pin.push()} />
      </box>
    </OpenPromptsContext.Provider>
  );
}
