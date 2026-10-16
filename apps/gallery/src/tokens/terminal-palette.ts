/**
 * A palette built from the colors the terminal reports, the way Pi and OpenCode follow the user's
 * terminal theme: each ramp borrows the hue of one ANSI color, and the ramp sets its own
 * lightness.
 */

import type { TerminalColors } from "@opentui/core";

import { hexToOklch } from "./oklch.ts";
import type { Palette, RampName } from "./palettes.ts";
import { FINE_STEPS, type RampSpec, STANDARD_STEPS } from "./ramp.ts";

/** The ANSI slot each ramp borrows its hue from. */
const ANSI_SLOT: Readonly<Record<Exclude<RampName, "neutral">, number>> = {
  accent: 4,
  danger: 1,
  warning: 3,
  success: 2,
  info: 6,
};

export const ANSI_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
] as const;

const rampFrom = (hex: string, steps: RampSpec["steps"], maxChroma: number): RampSpec => {
  const { hue, chroma } = hexToOklch(hex);

  return { hue, chroma: Math.min(chroma, maxChroma), steps };
};

/** None when the terminal did not report its background or one of the borrowed ANSI colors. */
export const terminalPalette = (colors: TerminalColors): Palette | undefined => {
  const background = colors.defaultBackground;
  const slots = Object.values(ANSI_SLOT).map((slot) => colors.palette[slot]);

  if (background === null || slots.some((hex) => hex === null || hex === undefined))
    return undefined;

  const hued = (name: keyof typeof ANSI_SLOT) =>
    rampFrom(colors.palette[ANSI_SLOT[name]] ?? background, STANDARD_STEPS, 0.16);

  return {
    id: "terminal",
    name: "Terminal",
    mood: "Your terminal's own theme.",
    rationale:
      "Hues come from its ANSI colors; Liminal sets the lightness, so contrast holds whatever theme you run.",
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
