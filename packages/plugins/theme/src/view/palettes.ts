/**
 * The palettes Liminal ships. Each one is a near-colorless base and a single accent; the status
 * colors are shared in spirit and nudged per palette so none of them can be mistaken for the
 * accent.
 */

import type { Palette, RampSpec } from "../contract.ts";
import { FINE_STEPS, STANDARD_STEPS } from "./ramp.ts";

const neutral = (hue: number, chroma: number): RampSpec => ({ hue, chroma, steps: FINE_STEPS });

const hued = (hue: number, chroma: number): RampSpec => ({ hue, chroma, steps: STANDARD_STEPS });

export const PALETTES: readonly [Palette, ...Palette[]] = [
  {
    id: "liminal",
    name: "Liminal",
    mood: "The threshold hour. Violet-black glass, one pale lilac light.",
    rationale:
      "The accent is the lilac of the gallery title, and the base is the same violet-black, so the grays lean toward it and nothing on screen is a foreign color. Lilac is pale and soft, which keeps one accent calm on dark. Amber is the only warm note, kept for warnings, with red, green and cyan spread far enough around the wheel not to be mistaken for it.",
    ramps: {
      neutral: { ...neutral(290, 0.024), textShift: -0.05 },
      accent: { ...hued(296, 0.1), shift: -0.07 },
      danger: hued(12, 0.15),
      warning: hued(75, 0.11),
      success: hued(165, 0.09),
      info: hued(225, 0.08),
    },
  },
  {
    id: "afterhours",
    name: "Afterhours",
    mood: "A white-cube gallery after closing. Ink, bone, one orange box on the plinth.",
    rationale:
      "The grays carry almost no hue, so the orange is the only warmth on screen. One saturated note on a colorless ground is how luxury houses use their signature color.",
    ramps: {
      neutral: neutral(60, 0.004),
      accent: hued(50, 0.14),
      danger: hued(10, 0.15),
      warning: hued(95, 0.12),
      success: hued(160, 0.09),
      info: hued(240, 0.08),
    },
  },
  {
    id: "heure-bleue",
    name: "Heure Bleue",
    mood: "The blue hour over a city. Slate sky, the last apricot light on stone.",
    rationale:
      "Blue and apricot sit opposite on the color wheel, so a soft accent glows against blue-gray without needing much saturation. The base is cool, the accent is the only warm thing.",
    ramps: {
      neutral: neutral(265, 0.02),
      accent: hued(58, 0.1),
      danger: hued(10, 0.15),
      warning: hued(105, 0.11),
      success: hued(160, 0.09),
      info: hued(235, 0.08),
    },
  },
  {
    id: "conservatory",
    name: "Conservatory",
    mood: "A glasshouse at night. Deep green, aged brass, a red bloom.",
    rationale:
      "Green-black and brass are the old pairing of racing green and hardware. The brass is kept low in saturation so it reads as metal, not yellow; warning moves to orange to stay clear of it.",
    ramps: {
      neutral: neutral(165, 0.016),
      accent: hued(92, 0.075),
      danger: hued(10, 0.15),
      warning: hued(55, 0.14),
      success: hued(145, 0.11),
      info: hued(235, 0.08),
    },
  },
  {
    id: "barbican",
    name: "Barbican",
    mood: "Raw concrete, still water, a single cobalt door.",
    rationale:
      "Concrete gray is cool and nearly hueless, so a cobalt accent reads as part of the same cold material. All the warmth is saved for warnings and errors, which makes them stand out.",
    ramps: {
      neutral: neutral(250, 0.005),
      accent: hued(260, 0.13),
      danger: hued(25, 0.14),
      warning: hued(75, 0.12),
      success: hued(145, 0.1),
      info: hued(205, 0.085),
    },
  },
];

/** The palette a user who has not picked one gets. */
export const DEFAULT_PALETTE_ID = "liminal";

/** The palette named `id`; the default one when `id` is unset or names no palette. */
export const paletteOf = (id?: string): Palette =>
  PALETTES.find((palette) => palette.id === id)
  ?? PALETTES.find((palette) => palette.id === DEFAULT_PALETTE_ID)
  ?? PALETTES[0];
