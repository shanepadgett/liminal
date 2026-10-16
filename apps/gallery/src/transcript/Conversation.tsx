/**
 * A session at one moment: the finished turns, then the turns played one after another, each shown
 * once it has begun, scrolled so the newest line stays in view. Once a turn's prompt scrolls past
 * the top, a copy of it stays pinned there, so the reply in view always shows what it answers,
 * until the next prompt arrives and pushes it out the top. A prompt opens and closes together with
 * its pinned copy.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, Index, onCleanup, Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import { createPin } from "./pin.ts";
import { durationOf, frameAt, turnsAt } from "./play.ts";
import { Reply } from "./Reply.tsx";
import type { Prompt, Script } from "./script.ts";
import { Sent } from "./Sent.tsx";

const PADDING_X = 2;

const toggled = (indexes: ReadonlySet<number>, index: number): ReadonlySet<number> => {
  const next = new Set(indexes);

  if (!next.delete(index)) next.add(index);

  return next;
};

/**
 * The pinned prompt, drawn over the top of the scrolled turns. Not keyed: moving the pin to another
 * turn keeps the measured prompt and only swaps its text, so it never draws a blank frame.
 */
function Pinned(props: {
  readonly color: RoleColor;
  readonly prompt: Prompt | undefined;
  readonly push: number;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Show when={props.prompt}>
      {(prompt) => (
        <box
          position="absolute"
          top={-props.push}
          left={0}
          right={0}
          paddingX={PADDING_X}
          backgroundColor={props.color("surface.base")}
        >
          <Sent
            color={props.color}
            prompt={prompt()}
            isOpen={props.isOpen}
            isPinned
            onToggle={props.onToggle}
          />
        </box>
      )}
    </Show>
  );
}

/** Every turn shown at `ms`: the finished ones whole, then the playing ones that have begun. */
const turnsOf = (finished: readonly Script[], playing: readonly Script[], ms: number) => [
  ...finished.map((script) => ({ script, ms: durationOf(script) })),
  ...turnsAt(playing, ms),
];

/** A turn in the scrolled column, its prompt measured for the pin while it is shown. */
function ScrolledTurn(props: {
  readonly color: RoleColor;
  readonly script: Script;
  readonly ms: number;
  readonly index: number;
  readonly prompts: Map<number, BoxRenderable>;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}) {
  onCleanup(() => props.prompts.delete(props.index));

  return (
    <box flexDirection="column">
      <box ref={(box: BoxRenderable) => props.prompts.set(props.index, box)}>
        <Sent
          color={props.color}
          prompt={props.script.prompt}
          isOpen={props.isOpen}
          isPinned={false}
          onToggle={props.onToggle}
        />
      </box>
      <Reply color={props.color} frame={frameAt(props.script, props.ms)} />
    </box>
  );
}

export function Conversation(props: {
  readonly color: RoleColor;
  readonly finished: readonly Script[];
  readonly playing: readonly Script[];
  readonly ms: number;
}) {
  const [openPrompts, setOpenPrompts] = createSignal<ReadonlySet<number>>(new Set());
  const pin = createPin();

  const turns = () => turnsOf(props.finished, props.playing, props.ms);
  const pinned = () => turns()[pin.pinnedIndex() ?? -1]?.script.prompt;

  const toggle = (index: number | undefined) => {
    if (index !== undefined) setOpenPrompts((indexes) => toggled(indexes, index));
  };

  return (
    <box
      width="100%"
      height="100%"
      overflow="hidden"
      backgroundColor={props.color("surface.base")}
      onMouseScroll={pin.onScroll}
    >
      <scrollbox
        ref={pin.setScroll}
        flexGrow={1}
        stickyScroll
        stickyStart="bottom"
        scrollbarOptions={{ visible: false }}
        renderBefore={pin.check}
      >
        <box flexDirection="column" gap={1} paddingX={PADDING_X} paddingY={1}>
          <Index each={turns()}>
            {(turn, index) => (
              <ScrolledTurn
                color={props.color}
                script={turn().script}
                ms={turn().ms}
                index={index}
                prompts={pin.prompts}
                isOpen={openPrompts().has(index)}
                onToggle={() => {
                  toggle(index);
                }}
              />
            )}
          </Index>
        </box>
      </scrollbox>
      <Pinned
        color={props.color}
        prompt={pinned()}
        push={pin.push()}
        isOpen={openPrompts().has(pin.pinnedIndex() ?? -1)}
        onToggle={() => {
          toggle(pin.pinnedIndex());
        }}
      />
    </box>
  );
}
