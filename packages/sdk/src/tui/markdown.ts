/** The Markdown syntax style: headings and strong text in the heading color, code in the accent. */

import { SyntaxStyle, type StyleDefinitionInput } from "@opentui/core";
import { useRenderer } from "@opentui/solid";
import { createMemo, onCleanup } from "solid-js";

import type { RoleColor } from "./tokens/roles.ts";

/** The widest a line of reply text runs, in columns; wider lines are hard to read. */
export const READING_WIDTH = 120;

const stylesOf = (color: RoleColor): Record<string, StyleDefinitionInput> => ({
  default: { fg: color("text.base") },
  "markup.heading": { fg: color("text.heading"), bold: true },
  "markup.strong": { fg: color("text.heading"), bold: true },
  "markup.italic": { italic: true },
  "markup.strikethrough": { fg: color("text.muted") },
  "markup.raw": { fg: color("text.accent") },
  "markup.quote": { fg: color("text.muted"), italic: true },
  "markup.list": { fg: color("text.faint") },
  "markup.link": { fg: color("text.accent"), underline: true },
  "markup.link.label": { fg: color("text.accent") },
  "markup.link.url": { fg: color("text.faint") },
  conceal: { fg: color("text.ghost") },
});

/** The `<markdown>` syntax style for `color`, freed when the calling component is disposed. */
export const useMarkdownStyle = (color: () => RoleColor) => {
  const renderer = useRenderer();

  return createMemo(() => {
    const made = SyntaxStyle.fromStyles(stylesOf(color()), renderer.nativeScene);

    onCleanup(() => {
      made.destroy();
    });

    return made;
  });
};
