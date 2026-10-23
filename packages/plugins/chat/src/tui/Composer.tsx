/**
 * Where the user writes. No box: a gutter of marks runs down the left of the draft, the first a
 * bold chevron and the rest fading from light accent to dark. Below are the hints of the keys that
 * act now, while the draft has focus. `enter` sends and `shift+enter` adds a line; while a turn
 * runs, `enter` steers it, `tab` queues a follow-up and `esc` stops it. `ctrl+c` clears the draft,
 * and with none passes on, so it quits. A draft trigger, such as `@`, opens its menu above the
 * draft; the menu's keys come first.
 */

import { type BoxRenderable, TextAttributes, type TextareaRenderable } from "@opentui/core";
import { useBindings, useKeymapSelector } from "@opentui/keymap/solid";
import { createSignal, For, Show } from "solid-js";

import type { SendMode } from "@shanepadgett/liminal-loop/contract";
import {
  activeHints,
  type Command,
  keymapCommand,
  kit,
  useColor,
  useMix,
  useSyntax,
} from "@shanepadgett/liminal-tui";

import { useDraftMenu } from "./draft-menu.ts";
import { DraftMenu } from "./DraftMenu.tsx";
import type { ChatScreen } from "./screen.ts";
import type { ComposerProps } from "./slots.ts";
import type { DraftTriggers } from "./triggers.ts";

const DRAFT_ROWS = 3;

const PROMPT = "❯";

const CONTINUATION = "╎";

/** The gutter's marks down `rows` rows. */
function Gutter(props: { readonly rows: number }) {
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

/** The draft's own keys, each acting only when it would do something now. */
const composerCommands = (props: ComposerProps, draft: Draft, text: () => string): Command[] => {
  const hasText = () => text() !== "";
  const sendAs = sender(props, draft, text);

  return [
    {
      name: "chat.send",
      title: "Send",
      hint: { label: "send" },
      enabled: () => hasText() && !props.running,
      run: sendAs(),
    },
    {
      name: "chat.steer",
      title: "Steer the turn",
      hint: { label: "steer" },
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
      name: "chat.stop",
      title: "Stop",
      hint: { label: "stop" },
      enabled: () => props.running,
      run: () => {
        props.cancel();
      },
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
  ];
};

const COMPOSER_KEYS = [
  { key: "return", cmd: "chat.send" },
  { key: "return", cmd: "chat.steer" },
  { key: "kpenter", cmd: "chat.send" },
  { key: "kpenter", cmd: "chat.steer" },
  { key: "shift+return", cmd: "chat.newline" },
  { key: "tab", cmd: "chat.follow-up" },
  { key: "escape", cmd: "chat.stop" },
  { key: "ctrl+c", cmd: "chat.clear" },
];

/** The hints, right-aligned; those that do not fit drop from the end. */
function HintRow(props: { readonly hints: ReadonlyArray<kit.Hint> }) {
  let row: BoxRenderable | undefined;
  const [columns, setColumns] = createSignal<number>();

  return (
    <box
      ref={(made) => {
        row = made;
      }}
      flexDirection="row"
      justifyContent="flex-end"
      marginTop={1}
      onSizeChange={() => {
        setColumns(row?.width);
      }}
    >
      <kit.Hints hints={props.hints} columns={columns()} />
    </box>
  );
}

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

  // Only while the draft has focus; behind a dialog the dialog shows its own keys.
  const hints = useKeymapSelector((keymap) => (draft?.focused === true ? activeHints(keymap) : []));

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
      <HintRow hints={hints()} />
    </box>
  );
}
