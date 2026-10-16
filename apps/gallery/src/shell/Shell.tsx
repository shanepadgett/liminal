/**
 * The gallery's frame: the wordmark and the current group's entries on the left, the chosen entry
 * on the right in the chosen palette and size, and key hints at the bottom.
 */

import { type BoxRenderable, type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createEffect, createSignal, For, on, Show } from "solid-js";

import type { Palette } from "../tokens/palettes.ts";
import type { Bookmark } from "./bookmark.ts";
import { CHROME } from "./chrome.ts";
import type { Entry, EntryState, Group, Groups, Section } from "./entries.ts";
import { Frame } from "./Frame.tsx";
import { KeyHints } from "./KeyHints.tsx";
import { useShellKeys } from "./keys.ts";
import {
  findPaletteIndex,
  findPlace,
  findSizeIndex,
  listEntries,
  moveEntry,
  moveGroup,
  nextState,
  type Place,
} from "./navigation.ts";
import { type Area, describeFrame, FIT, type FrameSize, frameArea, SIZES } from "./sizes.ts";

const NAV_COLUMNS = 28;

const WORDMARK = "l i m i n a l";

function GroupLine(props: { readonly group: Group; readonly position: string }) {
  return (
    <box flexDirection="row" justifyContent="space-between" marginTop={1} marginBottom={2}>
      <text fg={CHROME.text}>{props.group.title}</text>
      <text fg={CHROME.faint}>{props.position}</text>
    </box>
  );
}

function SectionList(props: { readonly section: Section; readonly selected: Entry | undefined }) {
  return (
    <box flexDirection="column" marginBottom={1}>
      <text fg={CHROME.warm} attributes={TextAttributes.BOLD} marginBottom={1}>
        {props.section.title}
      </text>
      <For each={props.section.entries}>
        {(entry) => (
          <text fg={entry === props.selected ? CHROME.accent : CHROME.muted}>{entry.title}</text>
        )}
      </For>
    </box>
  );
}

function Nav(props: {
  readonly group: Group;
  readonly position: string;
  readonly selected: Entry | undefined;
}) {
  return (
    <box
      width={NAV_COLUMNS}
      flexShrink={0}
      flexDirection="column"
      paddingX={2}
      border={["right"]}
      borderColor={CHROME.rule}
    >
      <text fg={CHROME.accent}>{WORDMARK}</text>
      <GroupLine group={props.group} position={props.position} />
      <Show
        when={props.group.sections.length > 0}
        fallback={<text fg={CHROME.faint}>Nothing here yet.</text>}
      >
        <For each={props.group.sections}>
          {(section) => <SectionList section={section} selected={props.selected} />}
        </For>
      </Show>
    </box>
  );
}

/**
 * Which palette, state and size are showing: `Afterhours · 2/4 Idle, with text · 80×24`. The state
 * shows only when the entry has more than one.
 */
function ViewLine(props: {
  readonly entry: Entry;
  readonly stateIndex: number;
  readonly palette: Palette;
  readonly frame: string;
}) {
  return (
    <text marginBottom={1} flexShrink={0}>
      <span style={{ fg: CHROME.muted }}>{props.palette.name}</span>
      <Show when={props.entry.states.length > 1}>
        <span style={{ fg: CHROME.faint }}>
          {` · ${props.stateIndex + 1}/${props.entry.states.length} `}
        </span>
        <span style={{ fg: CHROME.muted }}>{props.entry.states[props.stateIndex]?.name}</span>
      </Show>
      <span style={{ fg: CHROME.faint }}>{` · ${props.frame}`}</span>
    </text>
  );
}

/** The chosen entry in its chosen state, drawn in a frame of the chosen size, centered. */
function Preview(props: {
  readonly entry: Entry | undefined;
  readonly stateIndex: number;
  readonly palette: Palette;
  readonly size: FrameSize;
  readonly setScroll: (box: ScrollBoxRenderable | undefined) => void;
}) {
  const [stage, setStage] = createSignal<BoxRenderable>();
  const [room, setRoom] = createSignal<Area>({ columns: 0, rows: 0 });

  const state = (): EntryState | undefined => props.entry?.states[props.stateIndex];
  const area = () => frameArea(props.size, room());

  return (
    <box flexGrow={1} flexDirection="column" paddingX={3}>
      <Show when={props.entry} keyed>
        {(entry) => (
          <ViewLine
            entry={entry}
            stateIndex={props.stateIndex}
            palette={props.palette}
            frame={describeFrame(props.size, area())}
          />
        )}
      </Show>
      <box
        ref={setStage}
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        onSizeChange={() => {
          const box = stage();
          if (box !== undefined) setRoom({ columns: box.width, rows: box.height });
        }}
      >
        <Show when={state()} keyed>
          {(shown) => (
            <Frame
              state={shown}
              palette={props.palette}
              area={area()}
              isBordered={props.size !== FIT}
              setScroll={props.setScroll}
            />
          )}
        </Show>
      </box>
    </box>
  );
}

type ShellProps = {
  readonly groups: Groups;
  /** The palettes `t` cycles through. */
  readonly palettes: readonly [Palette, ...Palette[]];
  /** Where to open, so a restart lands where the user was. */
  readonly bookmark: Bookmark | undefined;
  readonly onMove: (bookmark: Bookmark) => void;
  readonly quit: () => void;
};

export function Shell(props: ShellProps) {
  const renderer = useRenderer();
  const [place, setPlace] = createSignal<Place>(findPlace(props.groups, props.bookmark));
  const [scroll, setScroll] = createSignal<ScrollBoxRenderable>();

  const [paletteIndex, setPaletteIndex] = createSignal(
    findPaletteIndex(props.palettes, props.bookmark),
  );

  const [sizeIndex, setSizeIndex] = createSignal(findSizeIndex(SIZES, props.bookmark));

  const group = () => props.groups[place().groupIndex] ?? props.groups[0];
  const entry = () => listEntries(group())[place().entryIndex];
  const palette = () => props.palettes[paletteIndex()] ?? props.palettes[0];
  const size = () => SIZES[sizeIndex()] ?? SIZES[0];
  const position = () => `${place().groupIndex + 1}/${props.groups.length}`;

  createEffect(
    on([place, palette, size], () => {
      props.onMove({
        groupTitle: group().title,
        entryId: entry()?.id,
        stateName: entry()?.states[place().stateIndex]?.name,
        paletteId: palette().id,
        sizeName: size().name,
      });
    }),
  );

  useShellKeys(
    {
      moveGroup: (step) => setPlace(moveGroup(props.groups, place(), step)),
      moveEntry: (step) => setPlace(moveEntry(props.groups, place(), step)),
      nextState: () => setPlace(nextState(entry(), place())),
      nextPalette: () => setPaletteIndex((index) => (index + 1) % props.palettes.length),
      nextSize: () => setSizeIndex((index) => (index + 1) % SIZES.length),
      scrollPage: (direction) => scroll()?.scrollBy(direction * Math.max(1, renderer.height - 8)),
      quit: props.quit,
    },
    () => (entry()?.states.length ?? 0) > 1,
  );

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={CHROME.background}>
      <box flexDirection="row" flexGrow={1} paddingTop={1}>
        <Nav group={group()} position={position()} selected={entry()} />
        <Preview
          entry={entry()}
          stateIndex={place().stateIndex}
          palette={palette()}
          size={size()}
          setScroll={setScroll}
        />
      </box>
      <box paddingX={2} paddingY={1} flexShrink={0}>
        <KeyHints />
      </box>
    </box>
  );
}
