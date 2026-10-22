/**
 * Where the user writes. No box: a gutter of marks runs down the left of the draft, the first a
 * bold chevron and the rest fading from light accent to dark. Below are the keys that apply now.
 * `enter` sends and `shift+enter` adds a line; while a turn runs, `enter` steers it, `tab` queues a
 * follow-up and `esc` stops it. `ctrl+c` clears the draft, and with none passes on, so it quits. An
 * `@` opens the list of files and folders to tag above the draft; its keys come first.
 */

import { TextAttributes, type TextareaRenderable } from "@opentui/core";
import { useBindings } from "@opentui/keymap/solid";
import { For, Show } from "solid-js";

import { kit, useColor, useMix, useSyntax } from "@shanepadgett/liminal-tui";

import type { ComposerProps } from "./slots.ts";
import { TAG_HINTS, TagMenu } from "./TagMenu.tsx";
import { useTagList } from "./tags.ts";

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

const IDLE_HINTS = [
  { keys: "enter", label: "send" },
  { keys: "shift+enter", label: "new line" },
];

const WORKING_HINTS = [
  { keys: "enter", label: "steer" },
  { keys: "tab", label: "follow-up" },
  { keys: "esc", label: "stop" },
];

const DRAFT_KEYS = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
] as const;

/** The draft's keys outside the textarea's own: `tab` and `esc` only while a turn runs. */
const useComposerKeys = (props: ComposerProps, take: () => string | undefined) => {
  useBindings(() => ({
    commands: [
      // Declines with no draft, so `ctrl+c` goes on to quit.
      { name: "chat.clear", title: "Clear draft", run: () => take() !== undefined },
      {
        name: "chat.follow-up",
        title: "Queue a follow-up",
        run: () => {
          const text = take();
          if (text !== undefined) props.send(text, "follow-up");
        },
      },
      { name: "chat.stop", title: "Stop", run: props.cancel },
    ],
    bindings: [
      { key: "ctrl+c", cmd: "chat.clear" },
      ...(props.running
        ? [
            { key: "tab", cmd: "chat.follow-up" },
            { key: "escape", cmd: "chat.stop" },
          ]
        : []),
    ],
  }));
};

export function Composer(props: ComposerProps) {
  const color = useColor();
  const syntax = useSyntax();
  let draft: TextareaRenderable | undefined;
  const tags = useTagList(() => draft);

  /** The draft's text, cleared from the textarea; nothing when it is blank. */
  const take = () => {
    const text = draft?.plainText.trim() ?? "";
    if (text !== "") draft?.clear();

    return text === "" ? undefined : text;
  };

  useComposerKeys(props, take);

  const hints = () =>
    tags.rows() === undefined
      ? [...(props.running ? WORKING_HINTS : IDLE_HINTS), ...props.screenHints]
      : TAG_HINTS;

  const submit = () => {
    const text = take();
    if (text !== undefined) props.send(text, props.running ? "steer" : undefined);
  };

  return (
    <box flexShrink={0} paddingX={2} paddingTop={1}>
      <Show when={tags.rows()}>{(rows) => <TagMenu rows={rows()} under={tags.under()} />}</Show>
      <box flexDirection="row" height={DRAFT_ROWS}>
        <Gutter rows={DRAFT_ROWS} />
        <textarea
          ref={(made) => {
            draft = made;
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
          onSubmit={submit}
          onContentChange={tags.refresh}
          onCursorChange={tags.refresh}
        />
      </box>
      <box flexDirection="row" justifyContent="flex-end" marginTop={1}>
        <kit.Hints hints={hints()} />
      </box>
    </box>
  );
}
