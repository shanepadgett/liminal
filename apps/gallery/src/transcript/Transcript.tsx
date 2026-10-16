/**
 * A session drawn in a style, scrolled. Each turn is the user's prompt over the assistant's reply.
 * Once a turn's prompt scrolls past the top, a copy of it stays pinned there, so the reply in view
 * always shows what it answers, until the next prompt arrives and pushes it out the top. Prompts
 * open and close together with their pinned copy.
 */

import type { BoxRenderable, ScrollBoxRenderable } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createSignal, For, Show } from "solid-js";

import type { RoleColor } from "../tokens/roles.ts";
import type { Turn } from "./entries.ts";
import type { Style } from "./levels.ts";
import { Reply } from "./Reply.tsx";
import { UserPrompt } from "./UserPrompt.tsx";

const PADDING_X = 2;

/** The last turn whose prompt has scrolled above the top of the view. */
const pinnedTurnIndex = (
  prompts: ReadonlyMap<number, BoxRenderable>,
  viewTop: number,
): number | undefined => {
  let pinned: number | undefined;

  for (const [index, prompt] of prompts) {
    if (prompt.y < viewTop && (pinned === undefined || index > pinned)) pinned = index;
  }

  return pinned;
};

const toggled = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(ids);

  if (!next.delete(id)) next.add(id);

  return next;
};

/**
 * How far the next prompt pushes the pinned one up: nothing until the next prompt's top reaches the
 * pinned prompt's bottom, then row for row, so the two never overlap.
 */
const pushOf = (
  prompts: ReadonlyMap<number, BoxRenderable>,
  pinned: number | undefined,
  viewTop: number,
): number => {
  if (pinned === undefined) return 0;

  const current = prompts.get(pinned);
  const next = prompts.get(pinned + 1);
  if (current === undefined || next === undefined) return 0;

  return Math.max(0, current.height - (next.y - viewTop));
};

/**
 * Which turn's prompt is pinned, and how far the next one pushes it. A wheel scroll bubbles up from
 * the scrollbox after it has moved, so `onScroll` updates the pin before the next frame and the two
 * move together. Other moves (sticky scroll to the bottom, a prompt opening) are caught as each
 * frame is drawn, and set after that frame, since changing the tree mid-draw is not safe.
 */
const createPin = () => {
  const [pinnedIndex, setPinnedIndex] = createSignal<number>();
  const [push, setPush] = createSignal(0);
  const [scroll, setScroll] = createSignal<ScrollBoxRenderable>();
  const prompts = new Map<number, BoxRenderable>();

  const update = () => {
    const view = scroll();
    if (view === undefined) return;

    const index = pinnedTurnIndex(prompts, view.viewport.y);
    setPinnedIndex(index);
    setPush(pushOf(prompts, index, view.viewport.y));
  };

  const onScroll = update;

  const check = () => {
    const view = scroll();
    if (view === undefined) return;

    const index = pinnedTurnIndex(prompts, view.viewport.y);
    const nextPush = pushOf(prompts, index, view.viewport.y);

    if (index !== pinnedIndex() || nextPush !== push()) queueMicrotask(update);
  };

  return { pinnedIndex, push, setScroll, prompts, check, onScroll };
};

/**
 * The pinned prompt, drawn over the top of the scrolled turns. Not keyed: moving the pin to another
 * turn keeps the measured prompt and only swaps its text, so it never draws a blank frame.
 */
function Pinned(props: {
  readonly color: RoleColor;
  readonly turn: Turn | undefined;
  readonly push: number;
  readonly children: (turn: () => Turn) => JSX.Element;
}) {
  return (
    <Show when={props.turn}>
      {(turn) => (
        <box
          position="absolute"
          top={-props.push}
          left={0}
          right={0}
          paddingX={PADDING_X}
          backgroundColor={props.color("surface.base")}
        >
          {props.children(turn)}
        </box>
      )}
    </Show>
  );
}

export function Transcript(props: {
  readonly color: RoleColor;
  readonly session: readonly Turn[];
  readonly style: Style;
  readonly isWorking: boolean;
  readonly openIds: ReadonlySet<string>;
}) {
  const [expandedPrompts, setExpandedPrompts] = createSignal<ReadonlySet<string>>(new Set());
  const pin = createPin();

  const prompt = (turn: () => Turn) => (
    <UserPrompt
      color={props.color}
      text={turn().prompt}
      isExpanded={expandedPrompts().has(turn().id)}
      onToggle={() => setExpandedPrompts((ids) => toggled(ids, turn().id))}
    />
  );

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
          <For each={props.session}>
            {(turn, index) => (
              <box flexDirection="column">
                <box ref={(box: BoxRenderable) => pin.prompts.set(index(), box)}>
                  {prompt(() => turn)}
                </box>
                <Reply
                  color={props.color}
                  reply={turn.reply}
                  style={props.style}
                  phase={
                    props.isWorking && index() === props.session.length - 1 ? "working" : "done"
                  }
                  openIds={props.openIds}
                />
              </box>
            )}
          </For>
        </box>
      </scrollbox>
      <Pinned color={props.color} turn={props.session[pin.pinnedIndex() ?? -1]} push={pin.push()}>
        {prompt}
      </Pinned>
    </box>
  );
}
