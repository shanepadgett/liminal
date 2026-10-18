/**
 * The working scan on the composer's top edge: lit columns that step down the palette's gradient to
 * the surface. Ordered dithering breaks each step into a stipple, so a handful of colors read as a
 * smooth falloff. The lit run is the header's glide, so the two move together.
 */

import { alongRun, type Cell, glideRun, mixHex, type RoleColor } from "@liminal/sdk/tui";

/** One eighth of a cell, along its top edge: the thinnest line a terminal can draw. */
const LINE = "▔";

/** A 1D ordered-dither threshold, tiled along the row. */
const THRESHOLDS = [0, 0.5, 0.25, 0.75] as const;

/** Surface first, then up the gradient to its brightest end. */
export const scanLevels = (color: RoleColor, surface: string): readonly string[] => [
  surface,
  mixHex(surface, color("gradient.to"), 0.5),
  color("gradient.to"),
  mixHex(color("gradient.to"), color("gradient.from"), 0.5),
  color("gradient.from"),
];

/** Lit columns as dithered cells of the levels' colors. */
export const ditherCells = (lit: readonly number[], levels: readonly string[]): readonly Cell[] => {
  const surface = levels[0] ?? "";
  const top = levels.length - 1;

  return lit.map((amount, column) => {
    const threshold = THRESHOLDS[column % THRESHOLDS.length] ?? 0;
    const level = Math.min(top, Math.floor(amount * top + threshold));

    return level === 0
      ? { glyph: " ", fg: surface, bg: surface }
      : { glyph: LINE, fg: levels[level] ?? surface, bg: surface };
  });
};

/** The dimmest a lit column gets, at the run's thin end. */
const GLIDE_TAIL_LIGHT = 0.3;

/**
 * How lit each column is, from 0 (surface) to 1 (brightest), at `phase` of the header's glide: a
 * lit run that stretches with speed.
 */
export const glideLight = (columns: number, phase: number): readonly number[] => {
  const run = glideRun(phase, columns);

  return Array.from({ length: columns }, (_, column) => {
    const along = alongRun(run, column);

    return along === undefined ? 0 : GLIDE_TAIL_LIGHT + (1 - GLIDE_TAIL_LIGHT) * along;
  });
};
