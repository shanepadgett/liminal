/**
 * A palette built from the colors the terminal reports, the way Pi and OpenCode follow the
 * terminal's theme: each ramp borrows the hue of one ANSI color and sets its own lightness.
 */

import type { TerminalColors } from "@opentui/core";

import { hexToOklch } from "../theme/oklch.ts";
import type { Palette, RampName } from "../theme/palettes.ts";
import { FINE_STEPS, type RampSpec, STANDARD_STEPS } from "../theme/ramp.ts";

/** The ANSI slot each hued ramp borrows from. */
const ANSI_SLOT: Readonly<Record<Exclude<RampName, "neutral">, number>> = {
  accent: 4,
  danger: 1,
  warning: 3,
  success: 2,
  info: 6,
};

const rampFrom = (hex: string, steps: RampSpec["steps"], maxChroma: number): RampSpec => {
  const { hue, chroma } = hexToOklch(hex);

  return { hue, chroma: Math.min(chroma, maxChroma), steps };
};

/** None when the terminal left out its background or one of the borrowed colors. */
export const terminalPalette = (colors: TerminalColors): Palette | undefined => {
  const background = colors.defaultBackground;
  const hexes = Object.values(ANSI_SLOT).map((slot) => colors.palette[slot]);

  if (background === null || hexes.some((hex) => hex === null || hex === undefined))
    return undefined;

  const hued = (name: keyof typeof ANSI_SLOT) =>
    rampFrom(colors.palette[ANSI_SLOT[name]] ?? background, STANDARD_STEPS, 0.16);

  return {
    id: "terminal",
    name: "Terminal",
    mood: "The terminal's own theme.",
    rationale: "Hues come from its ANSI colors; Liminal sets the lightness, so contrast holds.",
    ramps: {
      neutral: rampFrom(background, FINE_STEPS, 0.04),
      accent: hued("accent"),
      danger: hued("danger"),
      warning: hued("warning"),
      success: hued("success"),
      info: hued("info"),
    },
  };
};
