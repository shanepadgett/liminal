/**
 * The user's prompt, set apart from the work under it as a raised band with an accent bar down its
 * left edge. A long prompt shows its first two lines and ends in `…`; a click opens and closes it.
 */

import type { BoxRenderable } from "@opentui/core";
import { createSignal, For } from "solid-js";

import { EDGE_BAR } from "../ornament/edgeBar.ts";
import type { RoleColor } from "../tokens/roles.ts";
import { clampLines, wrapWords } from "./wrapWords.ts";

const COLLAPSED_LINES = 2;

export function UserPrompt(props: {
  readonly color: RoleColor;
  readonly text: string;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}) {
  const [body, setBody] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  // Nothing draws until the body knows its width, so the first frame does not wrap at one column.
  const lines = () => (columns() === 0 ? [] : wrapWords(props.text, columns()));
  const isLong = () => lines().length > COLLAPSED_LINES;

  const shownLines = () =>
    props.isExpanded ? lines() : clampLines(lines(), COLLAPSED_LINES, columns());

  return (
    <box
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={props.color("border.focus")}
      backgroundColor={props.color("surface.raised")}
      paddingX={2}
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
