/**
 * The model's words, drawn as Markdown with its lists, tables and Mermaid diagrams. While they
 * stream, the paragraph being written inks in above the ones that have settled. Prose wraps at a
 * readable width; code, tables and diagrams take all the width there is.
 */

import type { MarkdownOptions } from "@opentui/core";
import { createMemo, Match, Show, Switch } from "solid-js";

import { Inked } from "../../primitives/Ink.tsx";
import { useColor, useTheme } from "../../theme/theme.tsx";
import { useDiagrams } from "./diagrams.ts";
import { splitAt } from "./stream.ts";

/** The widest a line of prose gets, in columns. */
const PROSE_COLUMNS = 120;

/** Blocks that read better as wide as the screen allows: fences, diagrams among them, and tables. */
const WIDE_BLOCKS = new Set(["code", "table"]);

type RenderNode = NonNullable<MarkdownOptions["renderNode"]>;

/**
 * Draws fences with `fences` and caps every other block but tables at `PROSE_COLUMNS`. OpenTUI
 * updates a block it drew by default in place as the text streams, so the cap stays on it. With a
 * renderer for every block, OpenTUI keeps the blank rows between blocks only in its top-level block
 * mode, which `Markdown` turns on.
 */
const cappedProse =
  (fences: RenderNode): RenderNode =>
  (token, context) => {
    if (token.type === "code") return fences(token, context);
    if (WIDE_BLOCKS.has(token.type)) return null;

    const block = context.defaultRender();
    if (block !== null) block.maxWidth = PROSE_COLUMNS;

    return block;
  };

function Markdown(props: { readonly text: string; readonly isStreaming: boolean }) {
  const theme = useTheme();
  const color = useColor();
  const diagrams = useDiagrams();
  const renderNode = createMemo(() => cappedProse(diagrams()));

  return (
    <markdown
      content={props.text}
      streaming={props.isStreaming}
      syntaxStyle={theme().syntax}
      fg={color("text.base")}
      conceal
      renderNode={renderNode()}
      internalBlockMode="top-level"
      tableOptions={{
        style: "grid",
        widthMode: "content",
        cellPaddingX: 1,
        borderColor: color("border.base"),
        borderStyle: "rounded",
      }}
    />
  );
}

export function Reply(props: {
  readonly text: string;
  /** How many characters have streamed in; all of them when left out. */
  readonly streamed?: number;
}) {
  const split = () => splitAt(props.text, props.streamed ?? Number.POSITIVE_INFINITY);

  const markdown = () => {
    const current = split();

    return current.kind === "markdown" ? current : undefined;
  };

  const inked = () => {
    const current = split();

    return current.kind === "inked" ? current : undefined;
  };

  return (
    <Switch>
      <Match when={markdown()}>
        {(whole) => <Markdown text={whole().text} isStreaming={props.streamed !== undefined} />}
      </Match>
      <Match when={inked()}>
        {(live) => (
          <box gap={1}>
            <Show when={live().settled !== ""}>
              <Markdown text={live().settled} isStreaming />
            </Show>
            <box maxWidth={PROSE_COLUMNS}>
              <Inked text={live().live} shown={live().shown} role="text.base" />
            </box>
          </box>
        )}
      </Match>
    </Switch>
  );
}
