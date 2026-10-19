/**
 * Mermaid fences in Markdown drawn as box-drawing diagrams. A fence still being written, a diagram
 * that does not parse, or one wider than the space it has shows as its source instead.
 */

import {
  BoxRenderable,
  type MarkdownCodeBlockRenderer,
  type MarkdownOptions,
  type RenderContext,
  type RenderNodeContext,
  TextRenderable,
} from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { renderMermaidASCII } from "beautiful-mermaid";
import { Option } from "effect";
import { createMemo } from "solid-js";

import type { RoleColor } from "./tokens/roles.ts";

/** Spacing tight enough for a terminal, loose enough to keep edge labels off the boxes. */
const LAYOUT = { colorMode: "none", paddingX: 4, paddingY: 3, boxBorderPadding: 0 } as const;

const drawnOf = Option.liftThrowable((source: string) => renderMermaidASCII(source, LAYOUT));

/** Whether the fence's closing line has arrived. */
const isClosed = (raw: string) => /\n\s*(`{3,}|~{3,})$/.test(raw.trimEnd());

/** The diagram's lines, trailing spaces and blank lines dropped. */
const linesOf = (drawn: string) =>
  drawn
    .trimEnd()
    .split("\n")
    .map((line) => line.trimEnd());

/** The diagram, or its source while the diagram is wider than the block. */
const fitted = (
  renderer: RenderContext,
  lines: readonly string[],
  fg: string,
  context: RenderNodeContext,
) => {
  const source = context.defaultRender();
  const width = Math.max(0, ...lines.map((line) => Bun.stringWidth(line)));

  const drawing = new TextRenderable(renderer, {
    content: lines.join("\n"),
    fg,
    wrapMode: "none",
    height: lines.length,
  });

  const block = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "column",
    onSizeChange() {
      const fits = this.width >= width;
      drawing.visible = fits;
      if (source !== null) source.visible = !fits;
    },
  });

  block.add(drawing);

  if (source !== null) {
    source.visible = false;
    block.add(source);
  }

  return block;
};

const mermaidOf =
  (renderer: RenderContext, fg: string): MarkdownCodeBlockRenderer =>
  (token, context) => {
    if (!isClosed(token.raw)) return null;

    return Option.match(drawnOf(token.text), {
      onNone: () => null,
      onSome: (drawn) => fitted(renderer, linesOf(drawn), fg, context),
    });
  };

type RenderNode = NonNullable<MarkdownOptions["renderNode"]>;

/** Whether a Markdown token is a mermaid fence. */
const isMermaid = (
  token: Parameters<RenderNode>[0],
): token is Parameters<MarkdownCodeBlockRenderer>[0] =>
  token.type === "code" && "lang" in token && token.lang === "mermaid";

/** The `<markdown>` `renderNode` that draws mermaid fences, in the muted text color. */
export const useMarkdownDiagrams = (color: () => RoleColor) => {
  const renderer = useRenderer();

  return createMemo((): RenderNode => {
    const mermaid = mermaidOf(renderer, color()("text.muted"));

    return (token, context) => (isMermaid(token) ? mermaid(token, context) : null);
  });
};
