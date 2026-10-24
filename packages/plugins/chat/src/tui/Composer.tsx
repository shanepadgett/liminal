/**
 * Where the user writes. No box: a gutter of marks runs down the left of the draft, the first a
 * bold chevron and the rest fading from light accent to dark. Below are the `status` slot's fills,
 * such as the model line, and on the right the hints of the keys that act now, while the draft has
 * focus; without it, only the screen's `tab` and `ctrl+q`. `enter` sends and `shift+enter` adds a
 * line; while a turn runs, `enter` steers it, `tab` queues a follow-up and `esc` stops it. Queued
 * inputs show above the draft until the turn takes them; `alt+up` puts them back into the draft, as
 * `esc` does. `ctrl+c` clears the draft, and with none does what `esc` does. A draft trigger, such
 * as `@`, opens its menu above the draft; the menu's keys come first.
 */

import { TextAttributes, type TextareaRenderable } from "@opentui/core";
import { useBindings, useKeymapSelector } from "@opentui/keymap/solid";
import { Option } from "effect";
import { For, Show } from "solid-js";

import type { Queued, SendMode } from "@shanepadgett/liminal-loop/contract";
import {
  activeHints,
  type Command,
  keymapCommand,
  kit,
  SlotView,
  useColor,
  useMix,
  useSyntax,
} from "@shanepadgett/liminal-tui";

import { draftTextOf } from "../view/index.ts";
import { useDraftMenu } from "./draft-menu.ts";
import { DraftMenu } from "./DraftMenu.tsx";
import { type ChatScreen, SCREEN_HINTS } from "./screen.ts";
import { type ComposerProps, status } from "./slots.ts";
import type { DraftTriggers } from "./triggers.ts";

const DRAFT_ROWS = 3;

const PROMPT = "❯";

const CONTINUATION = "╎";

/** The gutter's marks down `rows` rows. */
export function Gutter(props: { readonly rows: number }) {
  const color = useColor();
  const mix = useMix();

  const rows = () => Array.from({ length: props.rows }, (_, row) => row);
  const marks = () => kit.gradientOf(mix, color("gradient.from"), color("gradient.to"), props.rows);

  return (
    <box width={3} flexShrink={0}>
      <For each={rows()}>
        {(row) => (
          <text
            fg={marks()[row] ?? ""}
            attributes={row === 0 ? TextAttributes.BOLD : TextAttributes.NONE}
          >
            {row === 0 ? PROMPT : CONTINUATION}
          </text>
        )}
      </For>
    </box>
  );
}

const QUEUED_MARKS = {
  steer: { mark: "↳", role: "text.accent" },
  "follow-up": { mark: "↓", role: "text.muted" },
} as const;

/** One queued input: its mode's mark and the first line the user wrote, cut at the width. */
function QueuedLine(props: { readonly queued: Queued; readonly text: string }) {
  const color = useColor();
  const look = () => QUEUED_MARKS[props.queued.mode];

  return (
    <text wrapMode="none">
      <span style={{ fg: color(look().role) }}>{`${look().mark}  `}</span>
      <span style={{ fg: color("text.faint") }}>{props.text.split("\n")[0]}</span>
    </text>
  );
}

/** The queued inputs the user wrote, oldest first. */
function QueuedLines(props: { readonly queued: ReadonlyArray<Queued> }) {
  const shown = () =>
    props.queued.flatMap((queued) =>
      Option.toArray(Option.map(draftTextOf(queued.input), (text) => ({ queued, text }))),
    );

  return <For each={shown()}>{(line) => <QueuedLine queued={line.queued} text={line.text} />}</For>;
}

/** The textarea's own keys, under the composer's: with no draft, enter submits to nothing. */
const DRAFT_KEYS = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
] as const;

type Draft = () => TextareaRenderable | undefined;

/** Sends the draft and clears it; `mode` only while a turn runs. */
const sender =
  (props: ComposerProps, draft: Draft, text: () => string) => (mode?: SendMode) => () => {
    const sent = text();
    draft()?.clear();
    props.send(sent, mode);
  };

/** Keys for the running turn and its queue. */
const turnCommands = (props: ComposerProps): Command[] => [
  {
    name: "chat.stop",
    title: "Stop",
    hint: { label: "stop", important: true },
    enabled: () => props.running,
    run: () => {
      props.cancel();
    },
  },
  {
    name: "chat.pull-back",
    title: "Edit queued inputs",
    // The keymap names alt `meta`; terminals and users call it alt.
    hint: { label: "edit queued", keys: "alt+up" },
    enabled: () => props.queued.length > 0,
    run: () => {
      props.pullBack();
    },
  },
];

/** The draft's own keys, each acting only when it would do something now. */
const composerCommands = (props: ComposerProps, draft: Draft, text: () => string): Command[] => {
  const hasText = () => text() !== "";
  const sendAs = sender(props, draft, text);

  return [
    {
      name: "chat.send",
      title: "Send",
      hint: { label: "send", important: true },
      enabled: () => hasText() && !props.running,
      run: sendAs(),
    },
    {
      name: "chat.steer",
      title: "Steer the turn",
      hint: { label: "steer", important: true },
      enabled: () => hasText() && props.running,
      run: sendAs("steer"),
    },
    {
      name: "chat.newline",
      title: "New line",
      hint: { label: "new line" },
      enabled: hasText,
      run: () => {
        draft()?.newLine();
      },
    },
    {
      name: "chat.follow-up",
      title: "Queue a follow-up",
      hint: { label: "follow-up" },
      enabled: () => hasText() && props.running,
      run: sendAs("follow-up"),
    },
    {
      name: "chat.clear",
      title: "Clear draft",
      hint: { label: "clear" },
      enabled: hasText,
      run: () => {
        draft()?.clear();
      },
    },
    ...turnCommands(props),
  ];
};

const COMPOSER_KEYS = [
  { key: "return", cmd: "chat.send" },
  { key: "return", cmd: "chat.steer" },
  { key: "kpenter", cmd: "chat.send" },
  { key: "kpenter", cmd: "chat.steer" },
  { key: "shift+return", cmd: "chat.newline" },
  { key: "tab", cmd: "chat.follow-up" },
  // Before `escape`, which answers `ctrl+c` too: the draft clears before the turn stops.
  { key: "ctrl+c", cmd: "chat.clear" },
  { key: "escape", cmd: "chat.stop" },
  { key: "alt+up", cmd: "chat.pull-back" },
];

export function Composer(
  props: ComposerProps & {
    readonly screen: ChatScreen["Service"];
    readonly triggers: DraftTriggers["Service"];
  },
) {
  const color = useColor();
  const syntax = useSyntax();
  let draft: TextareaRenderable | undefined;
  const menu = useDraftMenu(() => draft, props.triggers);

  // Without focus on the draft, such as behind a dialog, only the screen's own keys.
  const hints = useKeymapSelector((keymap) =>
    draft?.focused === true ? activeHints(keymap) : activeHints(keymap, SCREEN_HINTS),
  );

  useBindings(() => ({
    target: () => draft,
    commands: composerCommands(props, () => draft, props.screen.draft.text).map(keymapCommand),
    bindings: COMPOSER_KEYS,
  }));

  return (
    <box flexShrink={0} paddingX={2} paddingTop={1}>
      <Show when={menu.rows()}>
        {(rows) => <DraftMenu rows={rows()} under={menu.under()} empty={menu.empty()} />}
      </Show>
      <QueuedLines queued={props.queued} />
      <box flexDirection="row" height={DRAFT_ROWS}>
        <Gutter rows={DRAFT_ROWS} />
        <textarea
          ref={(made) => {
            draft = made;
            props.screen.attach(made);
          }}
          focused
          flexGrow={1}
          placeholder="Ask anything"
          placeholderColor={color("text.ghost")}
          textColor={color("text.base")}
          focusedTextColor={color("text.base")}
          cursorColor={color("text.accent")}
          wrapMode="word"
          syntaxStyle={syntax()}
          keyBindings={[...DRAFT_KEYS]}
          onContentChange={() => {
            props.screen.edited();
            menu.refresh();
          }}
          onCursorChange={menu.refresh}
        />
      </box>
      {/* The hints take the width the status fills leave, three cells from them. */}
      <box flexDirection="row" marginTop={1} gap={3}>
        <SlotView slot={status} session={props.screen.session()} />
        <box flexGrow={1} flexBasis={0}>
          <kit.Hints hints={hints()} end />
        </box>
      </box>
    </box>
  );
}
