/**
 * Inputs that stick to the top of the transcript. Once an input scrolls up past the top, a copy of
 * it stays there over the lines it started, until the next input comes up and pushes it out.
 */

import type { BoxRenderable, MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { type JSX, useRenderer } from "@opentui/solid";
import { createContext, createSignal, onCleanup, onMount, Show, useContext } from "solid-js";

import { Prompt } from "./Prompt.tsx";

/** An input drawn in the transcript. */
interface Row {
  readonly box: BoxRenderable;
  readonly text: () => string;
}

/** Adds a row to watch; the function it returns stops watching it. */
type AddRow = (row: Row) => () => void;

const Rows = createContext<AddRow>();

/** An input in the transcript; it sticks while it is inside `StickyScroll`. */
export function StickyRow(props: { readonly text: string; readonly children: JSX.Element }) {
  const add = useContext(Rows);
  const [box, setBox] = createSignal<BoxRenderable>();

  onMount(() => {
    const mounted = box();

    if (add === undefined || mounted === undefined) return;

    onCleanup(add({ box: mounted, text: () => props.text }));
  });

  return (
    <box flexShrink={0} ref={setBox}>
      {props.children}
    </box>
  );
}

/** The input stuck at the top, and how many of its rows the next input has pushed out. */
interface Stuck {
  readonly text: string;
  readonly rows: number;
  readonly shift: number;
}

const isSame = (before: Stuck | undefined, after: Stuck | undefined) =>
  before?.text === after?.text && before?.rows === after?.rows && before?.shift === after?.shift;

/**
 * The last input whose top has scrolled above `top`. The next input pushes it up once it comes
 * within a blank line of it; nothing is stuck once it is pushed out whole.
 */
const stuckOf = (rows: ReadonlySet<Row>, top: number): Stuck | undefined => {
  const sorted = [...rows].toSorted((first, second) => first.box.y - second.box.y);
  const index = sorted.findLastIndex((row) => row.box.y < top);
  const current = sorted[index];

  if (current === undefined) return undefined;

  const next = sorted[index + 1];
  const height = current.box.height;
  const shift = next === undefined ? 0 : Math.min(0, next.box.y - top - height - 1);

  return shift <= -height ? undefined : { text: current.text(), rows: height, shift };
};

/**
 * The input stuck on top of `scrollbox`'s lines, among `rows`. OpenTUI sends no scroll event, so it
 * looks again before each frame.
 */
const useStuck = (scrollbox: () => ScrollBoxRenderable | undefined, rows: ReadonlySet<Row>) => {
  const renderer = useRenderer();
  const [stuck, setStuck] = createSignal<Stuck | undefined>(undefined, { equals: isSame });

  const look = () => {
    const now = scrollbox();

    setStuck(now === undefined ? undefined : stuckOf(rows, now.viewport.y));

    return Promise.resolve();
  };

  renderer.setFrameCallback(look);

  onCleanup(() => {
    renderer.removeFrameCallback(look);
  });

  return stuck;
};

/** Cells between the transcript's sides and its lines. */
const SIDES = 2;

/** The copy of the stuck input, over the top of the transcript. */
function StuckCopy(props: { readonly stuck: Stuck; readonly scroll: (event: MouseEvent) => void }) {
  return (
    <box
      position="absolute"
      top={0}
      left={SIDES}
      right={SIDES}
      height={props.stuck.rows + props.stuck.shift}
      overflow="hidden"
      onMouseScroll={props.scroll}
    >
      <box position="absolute" top={props.stuck.shift} left={0} right={0}>
        <Prompt input={props.stuck.text} />
      </box>
    </box>
  );
}

/** The transcript's scroll area: it opens at the bottom, follows new lines and sticks inputs. */
export function StickyScroll(props: { readonly children: JSX.Element }) {
  const rows = new Set<Row>();
  const [scrollbox, setScrollbox] = createSignal<ScrollBoxRenderable>();
  const stuck = useStuck(scrollbox, rows);

  const add: AddRow = (row) => {
    rows.add(row);

    return () => {
      rows.delete(row);
    };
  };

  // The copy covers the top of the transcript, so the wheel over it still scrolls.
  const scroll = (event: MouseEvent) => {
    scrollbox()?.processMouseEvent(event);
    event.stopPropagation();
  };

  return (
    <box flexGrow={1}>
      <scrollbox
        ref={setScrollbox}
        flexGrow={1}
        stickyScroll
        stickyStart="bottom"
        paddingX={SIDES}
        scrollbarOptions={{ visible: false }}
      >
        <Rows.Provider value={add}>{props.children}</Rows.Provider>
      </scrollbox>
      <Show when={stuck()}>{(now) => <StuckCopy stuck={now()} scroll={scroll} />}</Show>
    </box>
  );
}
