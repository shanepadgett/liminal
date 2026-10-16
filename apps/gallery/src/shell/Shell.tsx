/**
 * The gallery's frame: the wordmark and the current group's entries on the left, the chosen entry
 * on the right, and key hints at the bottom.
 */

import { type ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createEffect, createSignal, ErrorBoundary, For, on, Show } from "solid-js";

import { CHROME } from "./chrome.ts";
import type { Entry, Group, Groups, Section } from "./entries.ts";
import { KeyHints } from "./KeyHints.tsx";
import { useShellKeys } from "./keys.ts";
import {
  type Bookmark,
  findPlace,
  listEntries,
  moveEntry,
  moveGroup,
  type Place,
} from "./navigation.ts";

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

/** The chosen entry, scrollable. A view that throws shows its error instead of closing the gallery. */
function Preview(props: {
  readonly entry: Entry | undefined;
  readonly setScroll: (box: ScrollBoxRenderable) => void;
}) {
  return (
    <scrollbox ref={props.setScroll} flexGrow={1} paddingX={3}>
      <Show when={props.entry} keyed>
        {(entry) => (
          <ErrorBoundary
            fallback={(error: Error) => (
              <text fg={CHROME.warm}>{`This entry failed to render: ${error.message}`}</text>
            )}
          >
            {entry.view()}
          </ErrorBoundary>
        )}
      </Show>
    </scrollbox>
  );
}

type ShellProps = {
  readonly groups: Groups;
  /** Where to open, so a hot reload lands where the user was. */
  readonly bookmark: Bookmark | undefined;
  readonly onMove: (bookmark: Bookmark) => void;
  readonly quit: () => void;
};

export function Shell(props: ShellProps) {
  const renderer = useRenderer();
  const [place, setPlace] = createSignal<Place>(findPlace(props.groups, props.bookmark));
  const [scroll, setScroll] = createSignal<ScrollBoxRenderable>();

  const group = () => props.groups[place().groupIndex] ?? props.groups[0];
  const entry = () => listEntries(group())[place().entryIndex];
  const position = () => `${place().groupIndex + 1}/${props.groups.length}`;

  createEffect(
    on(place, () => {
      props.onMove({ groupTitle: group().title, entryId: entry()?.id });
      const box = scroll();
      if (box !== undefined) box.scrollTop = 0;
    }),
  );

  useShellKeys({
    moveGroup: (step) => setPlace(moveGroup(props.groups, place(), step)),
    moveEntry: (step) => setPlace(moveEntry(props.groups, place(), step)),
    scrollPage: (direction) => scroll()?.scrollBy(direction * Math.max(1, renderer.height - 8)),
    quit: props.quit,
  });

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={CHROME.background}>
      <box flexDirection="row" flexGrow={1} paddingTop={1}>
        <Nav group={group()} position={position()} selected={entry()} />
        <Preview entry={entry()} setScroll={setScroll} />
      </box>
      <box paddingX={2} paddingY={1} flexShrink={0}>
        <KeyHints />
      </box>
    </box>
  );
}
