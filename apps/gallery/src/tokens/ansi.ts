/**
 * The 16 ANSI colors a palette draws terminal output with. Shell output names colors by ANSI slot
 * and leaves the shade to the terminal, which can be unreadable on Liminal's surfaces; remapping
 * the slots keeps that output legible and in the palette's voice.
 */

import type { Palette } from "./palettes.ts";
import { buildRamp, type RampSpec, type Step } from "./ramp.ts";

/** Hues for the slots no palette ramp covers. Red, green and yellow borrow the feedback hues. */
const BLUE_HUE = 255;
const MAGENTA_HUE = 330;
const CYAN_HUE = 200;
const BORROWED_CHROMA = 0.11;

const NORMAL_STEP: Step = 400;
const BRIGHT_STEP: Step = 300;

/** Bright magenta marks a shade that could not be built, so the gap is obvious. */
const MISSING_SHADE = "#ff00ff";

const shade = (spec: RampSpec, step: Step) =>
  buildRamp({ ...spec, steps: [step] })[0]?.hex ?? MISSING_SHADE;

const fixedHue = (hue: number): RampSpec => ({ hue, chroma: BORROWED_CHROMA, steps: [] });

/** Black, red, green, yellow, blue, magenta, cyan, white, then the bright eight in the same order. */
export const buildAnsi = (palette: Palette): readonly string[] => {
  const { neutral, danger, success, warning } = palette.ramps;

  const chromatic = [
    danger,
    success,
    warning,
    fixedHue(BLUE_HUE),
    fixedHue(MAGENTA_HUE),
    fixedHue(CYAN_HUE),
  ];

  const row = (black: Step, step: Step, white: Step) => [
    shade(neutral, black),
    ...chromatic.map((spec) => shade(spec, step)),
    shade(neutral, white),
  ];

  return [...row(800, NORMAL_STEP, 200), ...row(600, BRIGHT_STEP, 50)];
};
