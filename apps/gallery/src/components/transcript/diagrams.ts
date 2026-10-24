/**
 * Mermaid fences in a reply drawn as box-drawing diagrams. A fence still being written, a diagram
 * that does not parse, or one wider than the space it has shows as its source instead.
 */

import {
  BoxRenderable,
  createMarkdownCodeBlockRenderer,
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

import { useColor } from "../../theme/theme.tsx";

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

  // OpenTUI spaces a custom block by raising its top margin to the gap it wants; a box with no
  // margin set reads as NaN there and gets no gap.
  const block = new BoxRenderable(renderer, {
    width: "100%",
    flexDirection: "column",
    marginTop: 0,
    onSizeChange() {
      const fits = this.width >= width;
      drawing.visible = fits;
      if (source !== null) source.visible = !fits;
    },
  });

  block.add(drawing);

  if (source !== null) {
    source.visible = false;
    source.marginTop = 0;
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

/** Draws mermaid fences in the muted text color, and leaves every other fence to OpenTUI. */
export const useDiagrams = () => {
  const renderer = useRenderer();
  const color = useColor();

  return createMemo(
    () =>
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- createMarkdownCodeBlockRenderer always returns a function; its type reuses the optional prop's
      createMarkdownCodeBlockRenderer({
        mermaid: mermaidOf(renderer, color("text.muted")),
      }) as RenderNode,
  );
};
