/**
 * Liminal's signature ornament: eighth blocks that thicken from a hairline to a full cell, crossing
 * a threshold. Each placement draws one row of cells at a given width.
 */

import { mixHex } from "../tokens/oklch.ts";
import type { RoleColor } from "../tokens/roles.ts";

/** Left-aligned eighth blocks, thinnest first. */
export const FADE = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"] as const;

const FULL = "█";

export const HAIRLINE = "▏";

export type Cell = { readonly glyph: string; readonly fg: string; readonly bg: string };

type Placement = {
  readonly name: string;
  readonly note: string;
  readonly draw: (color: RoleColor, width: number) => readonly Cell[];
};

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export const plain = (text: string, fg: string, color: RoleColor): Cell[] =>
  Array.from(graphemes.segment(text), ({ segment }) => ({
    glyph: segment,
    fg,
    bg: color("surface.base"),
  }));

/** Dim and thin up to bright and full, along the palette's gradient. */
export const fadeIn = (color: RoleColor): Cell[] =>
  FADE.map((glyph, index) => ({
    glyph,
    fg: mixHex(color("gradient.to"), color("gradient.from"), index / (FADE.length - 1)),
    bg: color("surface.base"),
  }));

/**
 * Full and bright down to thin and dim. Eighth blocks only grow from the left, so the fade-out
 * paints the surface color over a filled cell instead.
 */
const fadeOut = (color: RoleColor): Cell[] =>
  FADE.slice(0, -1).map((glyph, index) => ({
    glyph,
    fg: color("surface.base"),
    bg: mixHex(color("gradient.from"), color("gradient.to"), index / (FADE.length - 2)),
  }));

const TITLE = "Session";

const title = (color: RoleColor) => plain(`${TITLE} `, color("text.base"), color);

export const PLACEMENTS: readonly Placement[] = [
  {
    name: "Tail",
    note: "A short fade after a title.",
    draw: (color) => [...title(color), ...fadeIn(color)],
  },
  {
    name: "Lead-in",
    note: "The fade crosses into the title.",
    draw: (color) => [...fadeIn(color), ...plain(` ${TITLE}`, color("text.base"), color)],
  },
  {
    name: "Edge",
    note: "Hairlines fill the width and thicken at the right edge.",
    draw: (color, width) => {
      const hairlines = width - TITLE.length - 1 - FADE.length;

      return [
        ...title(color),
        ...plain(HAIRLINE.repeat(Math.max(0, hairlines)), color("border.subtle"), color),
        ...fadeIn(color),
      ];
    },
  },
  {
    name: "Band",
    note: "A header: the fade swells into a solid run, then recedes before the details.",
    draw: (color, width) => {
      const wordmark = plain("liminal ", color("text.accent"), color);
      const details = plain(" main • 42%", color("text.muted"), color);
      const run = width - wordmark.length - details.length - FADE.length - (FADE.length - 1);

      return [
        ...wordmark,
        ...fadeIn(color),
        ...plain(FULL.repeat(Math.max(0, run)), color("gradient.from"), color),
        ...fadeOut(color),
        ...details,
      ];
    },
  },
];
