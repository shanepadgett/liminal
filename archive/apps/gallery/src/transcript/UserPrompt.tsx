/**
 * The user's prompt, set apart from the work under it as a raised band with an accent bar down its
 * left edge. A long prompt shows its first two lines and ends in `…`; a click opens and closes it.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, For } from "solid-js";

import { clampLines, EDGE_BAR, type RoleColor, wrapText } from "@liminal/sdk/tui";

const COLLAPSED_LINES = 2;
const PROMPT_PADDING = 2;

/** How far the prompt's text sits inside the band: its accent bar, then its padding. */
export const PROMPT_TEXT_INSET = 1 + PROMPT_PADDING;

export function UserPrompt(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  const [body, setBody] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  // Nothing draws until the body knows its width, so the first frame does not wrap at one column.
  const lines = () => (columns() === 0 ? [] : wrapText(props.text, columns()));
  const isLong = () => lines().length > COLLAPSED_LINES;

  const shownLines = () =>
    props.isExpanded ? lines() : clampLines(lines(), COLLAPSED_LINES, columns());

  return (
    <box
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={props.color("border.focus")}
      backgroundColor={props.color("surface.raised")}
      paddingX={PROMPT_PADDING}
      paddingY={1}
      onMouseUp={() => {
        if (isLong()) props.onToggle();
      }}
    >
      <box ref={setBody} flexDirection="column" onSizeChange={() => setColumns(body()?.width ?? 0)}>
        <For each={shownLines()}>
          {(line) => (
            <text wrapMode="none" fg={props.color("text.heading")}>
              {line}
            </text>
          )}
        </For>
      </box>
    </box>
  );
}
