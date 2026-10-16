/**
 * The working scan on the composer's top edge: lit columns that step down the palette's gradient to
 * the surface. Ordered dithering breaks each step into a stipple, so a handful of colors read as a
 * smooth falloff. Each motion decides how lit every column is at a point in its loop.
 */

import type { Cell } from "../ornament/fade.ts";
import { alongRun, GLIDE_PERIOD_MS, glideRun } from "../ornament/glide.ts";
import { mixHex } from "../tokens/oklch.ts";
import type { RoleColor } from "../tokens/roles.ts";

/** One eighth of a cell, along its top edge: the thinnest line a terminal can draw. */
const LINE = "▔";

/** A 1D ordered-dither threshold, tiled along the row. */
const THRESHOLDS = [0, 0.5, 0.25, 0.75] as const;

/** How lit each column is, from 0 (surface) to 1 (brightest), at `phase` of the loop. */
type Lighting = (columns: number, phase: number) => readonly number[];

export type ScanMotion = {
  readonly name: string;
  readonly periodMs: number;
  readonly light: Lighting;
};

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

const range = (columns: number) => Array.from({ length: columns }, (_, column) => column);

/** Slow at both ends of the sweep, fastest through the middle. */
const easeInOutSine = (progress: number) => (1 - Math.cos(Math.PI * progress)) / 2;

const SWEEP_LEAD_COLUMNS = 2;
const SWEEP_TRAIL_SHARE = 0.3;
const SWEEP_MIN_TRAIL_COLUMNS = 6;

/** A bright head that sweeps back and forth, trailing a glow. */
export const SWEEP: ScanMotion = {
  name: "sweep",
  periodMs: 2400,
  light: (columns, phase) => {
    const isOutbound = phase < 0.5;
    const direction = isOutbound ? 1 : -1;
    const head = easeInOutSine(isOutbound ? phase * 2 : 2 - phase * 2) * (columns - 1);
    const trailColumns = Math.max(SWEEP_MIN_TRAIL_COLUMNS, columns * SWEEP_TRAIL_SHARE);

    return range(columns).map((column) => {
      const offset = (column - head) * direction;
      const lit = offset > 0 ? 1 - offset / SWEEP_LEAD_COLUMNS : 1 + offset / trailColumns;

      return Math.max(0, lit) ** 1.5;
    });
  },
};

/** The dimmest a lit column gets, at the run's thin end. */
const GLIDE_TAIL_LIGHT = 0.3;

/** The header's glide on the composer's edge: a lit run that stretches with speed. */
export const GLIDE: ScanMotion = {
  name: "glide",
  periodMs: GLIDE_PERIOD_MS,
  light: (columns, phase) => {
    const run = glideRun(phase, columns);

    return range(columns).map((column) => {
      const along = alongRun(run, column);

      return along === undefined ? 0 : GLIDE_TAIL_LIGHT + (1 - GLIDE_TAIL_LIGHT) * along;
    });
  },
};
