/**
 * The gallery: the current group's entries on the left, the chosen state on the right in the chosen
 * palette and size, and the key hints at the bottom.
 */

import {
  type KeyEvent,
  type Renderable,
  type ScrollBoxRenderable,
  TextAttributes,
} from "@opentui/core";
import type { ActiveKey } from "@opentui/keymap";
import { useKeymapSelector } from "@opentui/keymap/solid";
import { useRenderer } from "@opentui/solid";
import { Predicate } from "effect";
import { createEffect, createSignal, For, Show } from "solid-js";

import type { Entry, Group } from "../entries.ts";
import { ThemeProvider } from "../theme/theme.tsx";
import type { Bookmark } from "./bookmark.ts";
import { CHROME } from "./chrome.ts";
import { Frame } from "./Frame.tsx";
import { useShellKeys } from "./keys.ts";
import { bookmarkOf, move, type Place, placeOf, type Shown, shownAt } from "./place.ts";

const NAV_COLUMNS = 26;

/** Rows a page scroll keeps from the previous screen. */
const SCROLL_OVERLAP = 8;

function Nav(props: { readonly shown: Shown; readonly position: string }) {
  return (
    <box
      width={NAV_COLUMNS}
      flexShrink={0}
      paddingX={2}
      border={["right"]}
      borderColor={CHROME.rule}
    >
      <text fg={CHROME.accent}>l i m i n a l</text>
      <box flexDirection="row" justifyContent="space-between" marginY={1}>
        <text fg={CHROME.text}>{props.shown.group.title}</text>
        <text fg={CHROME.faint}>{props.position}</text>
      </box>
      <For each={props.shown.group.sections}>
        {(section) => (
          <box marginBottom={1}>
            <text fg={CHROME.warm} attributes={TextAttributes.BOLD}>
              {section.title}
            </text>
            <For each={section.entries}>
              {(entry: Entry) => (
                <text fg={entry === props.shown.entry ? CHROME.accent : CHROME.muted}>
                  {entry.title}
                </text>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  );
}

/** `Liminal · 2/4 Draft · 80×24`; the state shows only when the entry has more than one. */
function StatusLine(props: { readonly shown: Shown; readonly place: Place }) {
  const count = () => props.shown.entry?.states.length ?? 0;

  return (
    <text marginBottom={1} flexShrink={0}>
      <span style={{ fg: CHROME.muted }}>{props.shown.palette.name}</span>
      <Show when={count() > 1}>
        <span style={{ fg: CHROME.faint }}>{` · ${props.place.state + 1}/${count()} `}</span>
        <span style={{ fg: CHROME.muted }}>{props.shown.state?.name}</span>
      </Show>
      <span style={{ fg: CHROME.faint }}>{` · ${props.shown.size.name}`}</span>
    </text>
  );
}

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  left: "←",
  right: "→",
  up: "↑",
  down: "↓",
  pageup: "pgup",
  pagedown: "pgdn",
  "shift+s": "S",
};

/** The keys that work right now, read from the keymap; keys that share a `desc` share a hint. */
const hintsOf = (active: readonly ActiveKey<Renderable, KeyEvent>[]): string => {
  const hints = new Map<string, string[]>();

  for (const key of active) {
    const desc = key.bindingAttrs?.["desc"];
    if (!Predicate.isString(desc)) continue;
    hints.set(desc, [...(hints.get(desc) ?? []), KEY_GLYPHS[key.display] ?? key.display]);
  }

  return [...hints]
    .map(([desc, keys]) => `${keys.join(keys.every((key) => key.length === 1) ? "" : " ")} ${desc}`)
    .join("   ");
};

export function Shell(props: {
  readonly groups: readonly [Group, ...Group[]];
  readonly bookmark: Bookmark | undefined;
  readonly save: (bookmark: Bookmark) => void;
  readonly quit: () => void;
}) {
  const renderer = useRenderer();
  const [place, setPlace] = createSignal(placeOf(props.groups, props.bookmark));
  const [scroll, setScroll] = createSignal<ScrollBoxRenderable>();
  const shown = () => shownAt(props.groups, place());

  const hints = useKeymapSelector((keymap) =>
    hintsOf(keymap.getActiveKeys({ includeMetadata: true })),
  );

  createEffect(() => {
    props.save(bookmarkOf(shown()));
  });

  useShellKeys(
    {
      move: (part, step) => setPlace((current) => move(props.groups, current, part, step)),
      scroll: (direction) =>
        scroll()?.scrollBy(direction * Math.max(1, renderer.height - SCROLL_OVERLAP)),
      quit: props.quit,
    },
    () => (shown().entry?.states.length ?? 0) > 1,
  );

  return (
    <box width="100%" height="100%" backgroundColor={CHROME.background}>
      <box flexDirection="row" flexGrow={1} paddingTop={1}>
        <Nav shown={shown()} position={`${place().group + 1}/${props.groups.length}`} />
        <box flexGrow={1} paddingX={3}>
          <StatusLine shown={shown()} place={place()} />
          <ThemeProvider palette={shown().palette}>
            <Show
              when={shown().state}
              keyed
              fallback={<text fg={CHROME.faint}>Nothing here yet.</text>}
            >
              {(state) => <Frame state={state} size={shown().size} setScroll={setScroll} />}
            </Show>
          </ThemeProvider>
        </box>
      </box>
      <text paddingX={2} paddingY={1} flexShrink={0} fg={CHROME.faint}>
        {hints()}
      </text>
    </box>
  );
}
