/**
 * Mermaid fences in a reply drawn as box-drawing diagrams. A fence still being written, a diagram
 * that does not parse, or one wider than the space it has shows as its source instead.
 */

import {
  type BoxOptions,
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

/**
 * A box with one blank row after it, as OpenTUI leaves after a code block, unless the reply ends
 * with it. OpenTUI leaves a custom block's spacing to its renderer and never says what comes next,
 * so the box checks its place each frame.
 */
const spacedBox = (renderer: RenderContext, options: BoxOptions) => {
  const block = new BoxRenderable(renderer, options);
  const gap = { rows: 0 };

  block.onLifecyclePass = () => {
    const rows = block.parent?.getChildren().at(-1) === block ? 0 : 1;

    if (rows === gap.rows) return;
    gap.rows = rows;
    block.marginBottom = rows;
  };

  return block;
};

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

  const block = spacedBox(renderer, {
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
    source.marginBottom = 0;
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

/**
 * The `<markdown>` `renderNode` that draws mermaid fences in the muted text color. It is OpenTUI's
 * code-block renderer, which handles only fences, so the rest of the Markdown keeps its spacing.
 */
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
