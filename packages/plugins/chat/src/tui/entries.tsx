/**
 * The core entries in the transcript: the user's prompt as a raised band with an accent bar, the
 * reply's text as Markdown, and its reasoning as a quiet `Thought` row that opens on a click.
 */

import { TextAttributes } from "@opentui/core";
import { createSignal, Show } from "solid-js";

import type { SavedEntry } from "@liminal/sdk";
import { EDGE_BAR, useColor, useMarkdownStyle } from "@liminal/sdk/tui";

interface EntryProps {
  readonly entry: SavedEntry;
}

export function Prompt(props: EntryProps) {
  const color = useColor();

  return (
    <box
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={color("border.focus")}
      backgroundColor={color("surface.raised")}
      paddingX={2}
      paddingY={1}
    >
      <text fg={color("text.heading")}>{props.entry.text}</text>
    </box>
  );
}

/** What the assistant said, as Markdown in the normal text color. */
export function Said(props: EntryProps) {
  const color = useColor();
  const style = useMarkdownStyle(() => color);

  return (
    <markdown content={props.entry.text} syntaxStyle={style()} fg={color("text.base")} conceal />
  );
}

/** What the assistant thought: a row that opens to the thought itself. */
export function Thought(props: EntryProps) {
  const color = useColor();
  const [isOpen, setIsOpen] = createSignal(false);

  return (
    <box flexDirection="column" onMouseUp={() => setIsOpen((was) => !was)}>
      <text>
        <span style={{ fg: color("text.ghost") }}>◆ </span>
        <b style={{ fg: color("text.muted") }}>Thought</b>
      </text>
      <Show when={isOpen()}>
        <box paddingLeft={2}>
          <text fg={color("text.faint")} attributes={TextAttributes.ITALIC}>
            {props.entry.text}
          </text>
        </box>
      </Show>
    </box>
  );
}
