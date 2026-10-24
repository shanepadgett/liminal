/**
 * Inputs that stick to the top of the transcript. Once an input scrolls up past the top, a copy of
 * it stays there over the lines it started, until the next input comes up and pushes it out. An
 * input taller than a third of the transcript does not stick, so the lines under it stay in view.
 */

import type { BoxRenderable, MouseEvent, ScrollBoxRenderable } from "@opentui/core";
import { type JSX, useRenderer } from "@opentui/solid";
import { createContext, createSignal, onCleanup, onMount, Show, useContext } from "solid-js";

import type { Written } from "../view/index.ts";
import { Prompt } from "./Prompt.tsx";

/** An input drawn in the transcript. */
interface Row {
  readonly box: BoxRenderable;
  readonly written: () => Written;
  readonly expanded: () => boolean;
  readonly toggle: () => void;
}

/** Adds a row to watch; the function it returns stops watching it. */
type AddRow = (row: Row) => () => void;

const Rows = createContext<AddRow>();

/** An input in the transcript; it sticks while it is inside `StickyScroll`. */
export function StickyPrompt(props: { readonly input: Written }) {
  const add = useContext(Rows);
  const [box, setBox] = createSignal<BoxRenderable>();
  const [expanded, setExpanded] = createSignal(false);
  const toggle = () => setExpanded(!expanded());

  onMount(() => {
    const mounted = box();

    if (add === undefined || mounted === undefined) return;

    onCleanup(add({ box: mounted, written: () => props.input, expanded, toggle }));
  });

  return (
    <box flexShrink={0} ref={setBox}>
      <Prompt input={props.input} expanded={expanded()} onToggle={toggle} />
    </box>
  );
}

/** The input stuck at the top, and how many of its rows the next input has pushed out. */
interface Stuck {
  readonly row: Row;
  readonly rows: number;
  readonly shift: number;
}

const isSame = (before: Stuck | undefined, after: Stuck | undefined) =>
  before?.row === after?.row && before?.rows === after?.rows && before?.shift === after?.shift;

/** Past this share of the transcript's height an input is too tall to stick. */
const MOST_STUCK_SHARE = 1 / 3;

/**
 * The last input whose top has scrolled above the top of `viewport`. The next input pushes it up
 * once it comes within a blank line of it; nothing is stuck once it is pushed out whole, or when it
 * is taller than a third of `viewport`.
 */
const stuckOf = (
  rows: ReadonlySet<Row>,
  viewport: { readonly y: number; readonly height: number },
): Stuck | undefined => {
  const sorted = [...rows].toSorted((first, second) => first.box.y - second.box.y);
  const index = sorted.findLastIndex((row) => row.box.y < viewport.y);
  const current = sorted[index];

  if (current === undefined) return undefined;

  const height = current.box.height;

  if (height > viewport.height * MOST_STUCK_SHARE) return undefined;

  const next = sorted[index + 1];
  const shift = next === undefined ? 0 : Math.min(0, next.box.y - viewport.y - height - 1);

  return shift <= -height ? undefined : { row: current, rows: height, shift };
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

    setStuck(now === undefined ? undefined : stuckOf(rows, now.viewport));

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
        <Prompt
          input={props.stuck.row.written()}
          expanded={props.stuck.row.expanded()}
          onToggle={props.stuck.row.toggle}
        />
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
