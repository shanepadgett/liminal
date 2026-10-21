/**
 * A ramp is one hue in light-to-dark steps, Tailwind style. Steps are numbers so a palette can add
 * an in-between step such as 150 where two neighbors are too far apart.
 */

import { oklchToHex } from "./oklch.ts";

export type Step = 50 | 100 | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 850 | 900 | 950;

/** OKLCH lightness of each step. Dark steps sit close together because terminal surfaces live there. */
const LIGHTNESS: Record<Step, number> = {
  50: 0.97,
  100: 0.93,
  150: 0.89,
  200: 0.85,
  300: 0.77,
  400: 0.68,
  500: 0.59,
  600: 0.5,
  700: 0.41,
  800: 0.32,
  850: 0.27,
  900: 0.23,
  950: 0.18,
};

export const STANDARD_STEPS: readonly Step[] = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
];

export const FINE_STEPS: readonly Step[] = [
  50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950,
];

export type RampSpec = {
  readonly hue: number;
  /** Chroma at the ramp's middle; the ends fade toward gray so light and dark steps stay calm. */
  readonly chroma: number;
  /** Added to every step's lightness, to darken (negative) or lighten a ramp as a whole. */
  readonly shift?: number;
  /**
   * Added to the lightness of steps 300 and lighter, which hold a neutral ramp's text, so text can
   * dim without moving the surfaces.
   */
  readonly textShift?: number;
  readonly steps: readonly Step[];
};

export type Swatch = { readonly step: Step; readonly hex: string };

/** The darkest step `textShift` reaches. */
const TEXT_STEPS_UNTIL = 300;

const chromaAt = (peak: number, lightness: number) =>
  peak * Math.max(0.25, 1 - ((lightness - 0.62) / 0.55) ** 2);

export const buildRamp = (spec: RampSpec): readonly Swatch[] =>
  spec.steps.map((step) => {
    const lightness =
      LIGHTNESS[step] + (spec.shift ?? 0) + (step <= TEXT_STEPS_UNTIL ? (spec.textShift ?? 0) : 0);

    return {
      step,
      hex: oklchToHex({ lightness, chroma: chromaAt(spec.chroma, lightness), hue: spec.hue }),
    };
  });
