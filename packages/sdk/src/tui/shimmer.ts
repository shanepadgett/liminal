/**
 * A band of light sweeping across a line of text, left to right, then resting off the end before it
 * comes round again. It is what says the current action is alive: the words stay put and only the
 * light moves.
 */

import { mixHex } from "./tokens/oklch.ts";

/** One sweep, and the rest after it. */
export const SHIMMER_PERIOD_MS = 2400;

/** Half the band's width, in characters. */
const BAND_RADIUS = 5;

/** The share of the period spent sweeping; the rest is the pause. */
const SWEEP_SHARE = 0.7;

/** How bright the text is `distance` characters from the band's center, from 0 to 1. */
const lightAt = (distance: number) =>
  distance >= BAND_RADIUS ? 0 : (1 + Math.cos((Math.PI * distance) / BAND_RADIUS)) / 2;

/** Each character's color as the band passes, `phase` of the way through the period. */
export const shimmerColors = (
  length: number,
  phase: number,
  dim: string,
  bright: string,
): readonly string[] => {
  const sweep = phase / SWEEP_SHARE;
  const center = -BAND_RADIUS + sweep * (length + 2 * BAND_RADIUS);

  return Array.from({ length }, (_, index) =>
    mixHex(dim, bright, lightAt(Math.abs(index - center))),
  );
};
