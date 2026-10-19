/**
 * The core entries in the transcript: the user's prompt as a raised band with an accent bar, and
 * the reply's text as Markdown. Its reasoning shows among the work rows.
 */

import type { BoxRenderable } from "@opentui/core";
import { createContext, createSignal, Index, useContext } from "solid-js";

import type { SavedEntry } from "@liminal/sdk";
import {
  clampLines,
  EDGE_BAR,
  useColor,
  useMarkdownDiagrams,
  useMarkdownStyle,
  wrapText,
} from "@liminal/sdk/tui";

interface EntryProps {
  readonly entry: SavedEntry;
}

/** Which prompts are open, by seq; the transcript holds it, so a pinned copy opens with its prompt. */
export interface OpenPrompts {
  readonly isOpen: (seq: number) => boolean;
  readonly toggle: (seq: number) => void;
}

export const OpenPromptsContext = createContext<OpenPrompts>();

const COLLAPSED_LINES = 2;

/**
 * What the user typed. A long prompt shows its first two lines and ends in `…`; a click opens and
 * closes it.
 */
export function Prompt(props: EntryProps) {
  const color = useColor();
  const open = useContext(OpenPromptsContext);
  if (open === undefined) throw new Error("<Prompt> rendered outside the transcript.");

  const [body, setBody] = createSignal<BoxRenderable>();
  const [columns, setColumns] = createSignal(0);

  // Nothing draws until the body knows its width, so the first frame does not wrap at one column.
  const lines = () => (columns() === 0 ? [] : wrapText(props.entry.text, columns()));
  const isLong = () => lines().length > COLLAPSED_LINES;

  const shown = () =>
    open.isOpen(props.entry.seq) ? lines() : clampLines(lines(), COLLAPSED_LINES, columns());

  return (
    <box
      border={["left"]}
      customBorderChars={EDGE_BAR}
      borderColor={color("border.focus")}
      backgroundColor={color("surface.raised")}
      paddingX={2}
      paddingY={1}
      onMouseUp={() => {
        if (isLong()) open.toggle(props.entry.seq);
      }}
    >
      <box ref={setBody} flexDirection="column" onSizeChange={() => setColumns(body()?.width ?? 0)}>
        <Index each={shown()}>
          {(line) => (
            <text wrapMode="none" fg={color("text.heading")}>
              {line() === "" ? " " : line()}
            </text>
          )}
        </Index>
      </box>
    </box>
  );
}

/** What the assistant said, as Markdown in the normal text color. */
export function Said(props: EntryProps) {
  const color = useColor();
  const style = useMarkdownStyle(() => color);
  const diagrams = useMarkdownDiagrams(() => color);

  return (
    <markdown
      content={props.entry.text}
      syntaxStyle={style()}
      renderNode={diagrams()}
      fg={color("text.base")}
      conceal
    />
  );
}
